const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

/* ---------------- Filename helper ---------------- */
function getFilename(url, headers) {
  if (headers?.['content-disposition']) {
    const cd = headers['content-disposition'];
    const match = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';]+)["']?/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  const pathname = new URL(url).pathname;
  let filename = path.basename(pathname);
  if (!filename || filename === '/') filename = 'download_' + Date.now();
  return filename;
}

/* ---------------- Redirect resolver ---------------- */
function followRedirects(url, headers = {}, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    function request(currentUrl) {
      const parsed = new URL(currentUrl);
      const protocol = parsed.protocol === 'https:' ? https : http;

      const reqHeaders = { ...headers };
      delete reqHeaders['host'];

      const req = protocol.request(parsed, {
        method: 'GET',
        headers: {
          ...reqHeaders,
          Range: 'bytes=0-0'
        },
        timeout: 10000
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (++redirectCount > maxRedirects) {
            return reject(new Error('Too many redirects'));
          }
          res.resume();
          return request(new URL(res.headers.location, currentUrl).href);
        }

        const isRangeSupported = res.statusCode === 206;

        let totalLength = -1;
        const cr = res.headers['content-range'];
        if (cr) {
          const m = cr.match(/\/(\d+)/);
          if (m) totalLength = parseInt(m[1], 10);
        }

        if (totalLength === -1 && res.statusCode === 200) {
          totalLength = parseInt(res.headers['content-length'] || '-1', 10);
        }

        res.destroy();

        resolve({
          finalUrl: currentUrl,
          headers: res.headers,
          isRangeSupported,
          totalLength
        });
      });

      req.on('error', reject);
      req.end();
    }

    request(url);
  });
}

/* ---------------- Downloader ---------------- */
class SegmentedDownloader extends EventEmitter {
  constructor(task) {
    super();

    this.id = task.id;
    this.url = task.url;
    this.filename = task.filename;

    this.saveDir = task.saveDir || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
    this.savePath = path.join(this.saveDir, this.filename);
    this.partsDir = this.savePath + '.parts';

    this.connections = task.connections || 8;
    this.headers = task.headers || {};

    this.status = 'queued';

    this.totalBytes = task.totalBytes || -1;
    this.downloadedBytes = 0;

    this.segments = [];
    this.activeRequests = [];

    this.speed = 0;
    this.eta = -1;

    this.isRangeSupported = true;
    this.isPaused = false;

    this.speedWindow = [];
    this.speedInterval = null;

    this.retryTimeouts = [];

    this._completionLocked = false;
    this._finalized = false;
  }

  /* ---------------- Prepare ---------------- */
  async prepare() {
    this.status = 'preparing';
    this.emit('status', { status: this.status });

    const info = await followRedirects(this.url, this.headers);

    this.url = info.finalUrl;
    this.isRangeSupported = info.isRangeSupported;
    this.totalBytes = info.totalLength;

    if (!this.filename) {
      this.filename = getFilename(this.url, info.headers);
      this.savePath = path.join(this.saveDir, this.filename);
      this.partsDir = this.savePath + '.parts';
    }

    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }

    const manifestPath = path.join(this.partsDir, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        this.segments = manifest.segments;

        let downloaded = 0;
        for (const seg of this.segments) {
          const p = path.join(this.partsDir, `part${seg.index}`);
          if (fs.existsSync(p)) {
            const size = fs.statSync(p).size;
            seg.downloaded = size;
            downloaded += size;
            
            const expectedSize = seg.end - seg.start + 1;
            if (seg.downloaded >= expectedSize) {
              seg.status = 'completed';
            } else {
              seg.status = 'pending';
            }
          } else {
            seg.downloaded = 0;
            seg.status = 'pending';
          }
          seg.retries = 0;
        }

        this.downloadedBytes = downloaded;
        return;
      } catch (e) {
        console.error('Failed to load manifest, starting fresh', e);
      }
    }

    this.segments = [];
    this.downloadedBytes = 0;

    if (this.isRangeSupported && this.totalBytes > 0 && this.connections > 1) {
      const size = Math.floor(this.totalBytes / this.connections);

      for (let i = 0; i < this.connections; i++) {
        this.segments.push({
          index: i,
          start: i * size,
          end: i === this.connections - 1 ? this.totalBytes - 1 : (i + 1) * size - 1,
          downloaded: 0,
          status: 'pending',
          retries: 0
        });
      }
    } else {
      this.isRangeSupported = false;
      this.connections = 1;
      this.segments = [{
        index: 0,
        start: 0,
        end: -1,
        downloaded: 0,
        status: 'pending',
        retries: 0
      }];
    }

    if (!fs.existsSync(this.partsDir)) {
      fs.mkdirSync(this.partsDir, { recursive: true });
    }

    this.saveManifest();
  }

  saveManifest() {
    try {
      fs.writeFileSync(
        path.join(this.partsDir, 'manifest.json'),
        JSON.stringify({
          id: this.id,
          url: this.url,
          filename: this.filename,
          totalBytes: this.totalBytes,
          connections: this.connections,
          segments: this.segments
        }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('Failed to write manifest:', e);
    }
  }

  /* ---------------- Start ---------------- */
  start() {
    if (this.status === 'downloading') return;

    this.status = 'downloading';
    this.isPaused = false;

    this.emit('status', { status: this.status });

    this.speedWindow = [{ time: Date.now(), bytes: this.downloadedBytes }];

    this.speedInterval = setInterval(() => {
      this.calculateSpeed();

      this.emit('progress', {
        downloadedBytes: this.downloadedBytes,
        totalBytes: this.totalBytes,
        speed: this.speed,
        eta: this.eta,
        segments: this.segments
      });
    }, 1000);

    for (const seg of this.segments) {
      if (seg.status !== 'completed') {
        this.downloadSegment(seg);
      }
    }
  }

  /* ---------------- Segment download ---------------- */
  downloadSegment(seg) {
    if (this.isPaused || seg.status === 'completed') return;

    seg.status = 'downloading';
    this.emit('segment-status', { segment: seg });

    const protocol = this.url.startsWith('https') ? https : http;

    const start = seg.start + seg.downloaded;
    const end = seg.end;

    const headers = { ...this.headers };
    delete headers['host'];

    if (this.isRangeSupported) {
      headers.Range = `bytes=${start}-${end}`;
    }

    const filePath = path.join(this.partsDir, `part${seg.index}`);
    const stream = fs.createWriteStream(filePath, { flags: seg.downloaded ? 'a' : 'w' });

    const req = protocol.get(this.url, { headers }, (res) => {
      if (this.isRangeSupported && res.statusCode !== 206) {
        stream.close();
        req.destroy();
        this.retrySegment(seg, new Error(`Server returned code ${res.statusCode} (expected 206)`));
        return;
      }

      res.on('data', (chunk) => {
        stream.write(chunk);
        seg.downloaded += chunk.length;

        this.downloadedBytes = this.segments.reduce((a, s) => a + s.downloaded, 0);
        if (this.totalBytes > 0 && this.downloadedBytes >= this.totalBytes) {
          this.downloadedBytes = this.totalBytes;
        }

        if (this.status === 'downloading') {
          this.emit('progress', {
            downloadedBytes: this.downloadedBytes,
            totalBytes: this.totalBytes,
            speed: this.speed,
            eta: this.eta,
            segments: this.segments
          });
        }
      });

      res.on('end', () => {
        stream.end(() => {
          if (seg.downloaded >= (seg.end - seg.start + 1) || !this.isRangeSupported) {
            this.finishSegment(seg);
          } else {
            this.retrySegment(seg, new Error('Connection closed prematurely'));
          }
        });
      });

      res.on('error', (err) => {
        stream.end(() => {
          this.retrySegment(seg, err);
        });
      });
    });

    req.on('error', (err) => {
      stream.end(() => {
        this.retrySegment(seg, err);
      });
    });

    this.activeRequests.push({ req, stream, segmentIndex: seg.index });
  }

  finishSegment(seg) {
    if (this.isPaused || seg.status === 'completed') return;
    seg.status = 'completed';
    this.activeRequests = this.activeRequests.filter(r => r.segmentIndex !== seg.index);
    this.saveManifest();
    this.emit('segment-status', { segment: seg });
    this.checkCompletion();
  }

  retrySegment(seg, error) {
    if (this.isPaused || seg.status === 'completed') return;
    this.activeRequests = this.activeRequests.filter(r => r.segmentIndex !== seg.index);

    console.error(`Segment ${seg.index} failed:`, error?.message || 'unknown error');

    if (seg.retries === undefined) seg.retries = 0;

    if (seg.retries >= 5) {
      seg.status = 'failed';
      this.emit('segment-status', { segment: seg, error: `Max retries reached: ${error?.message || ''}` });
      this.fail(`Segment ${seg.index} failed after 5 retries`);
      return;
    }

    seg.status = 'failed';
    this.emit('segment-status', { segment: seg, error: error?.message || 'unknown error' });

    seg.retries++;
    const timeoutId = setTimeout(() => {
      this.retryTimeouts = this.retryTimeouts.filter(t => t !== timeoutId);
      if (this.status === 'merging' || this.status === 'completed') return;
      if (!this.isPaused && seg.status === 'failed' && this.status !== 'merging') {
        console.log(`Retrying segment ${seg.index} (attempt ${seg.retries}/5)...`);
        this.downloadSegment(seg);
      }
    }, 5000);
    this.retryTimeouts.push(timeoutId);
  }

  /* ---------------- Completion ---------------- */
  async checkCompletion() {
    if (this._completionLocked) return;

    const done = this.segments.every(s => s.status === 'completed');
    if (!done) return;

    this._completionLocked = true;

    this.status = 'merging';
    this.emit('status', { status: this.status });

    if (this.speedInterval) {
      clearInterval(this.speedInterval);
      this.speedInterval = null;
    }

    this.retryTimeouts.forEach(clearTimeout);
    this.retryTimeouts = [];

    // Abort active requests
    this.activeRequests.forEach(({ req, stream }) => {
      try { req.destroy(); } catch (e) {}
      try { stream.end(); } catch (e) {}
    });
    this.activeRequests = [];

    if (this.totalBytes > 0) {
      this.downloadedBytes = this.totalBytes;
    }

    try {
      const out = fs.createWriteStream(this.savePath);

      for (const seg of this.segments) {
        const p = path.join(this.partsDir, `part${seg.index}`);
        if (fs.existsSync(p)) {
          await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(p);
            readStream.pipe(out, { end: false });
            readStream.on('end', resolve);
            readStream.on('error', reject);
          });
        }
      }

      out.end();

      out.on('close', () => {
        if (this._finalized) return;
        this._finalized = true;

        let finalFileSize = 0;
        try {
          finalFileSize = fs.statSync(this.savePath).size;
        } catch (e) {}

        if (this.totalBytes > 0) {
          const diff = Math.abs(finalFileSize - this.totalBytes);
          const pctDiff = diff / this.totalBytes;
          if (pctDiff > 0.05 && diff > 1024 * 1024) {
            this.status = 'failed';
            this.emit('status', { status: this.status });
            this.emit('error', `Merge validation failed: Expected file size to be ${this.totalBytes} bytes, but got ${finalFileSize} bytes on disk.`);
            return;
          }
        }

        // Cleanup
        try {
          for (let i = 0; i < this.segments.length; i++) {
            const partPath = path.join(this.partsDir, `part${i}`);
            if (fs.existsSync(partPath)) {
              fs.unlinkSync(partPath);
            }
          }
          const manifestPath = path.join(this.partsDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
          }
          if (fs.existsSync(this.partsDir)) {
            fs.rmdirSync(this.partsDir);
          }
        } catch (cleanupErr) {
          console.error('Failed to clean up temp files', cleanupErr);
        }

        this.status = 'completed';
        this.emit('status', { status: this.status });
        this.emit('completed', { savePath: this.savePath });
      });
    } catch (err) {
      this.fail(`Merge failed: ${err.message}`);
    }
  }

  fail(msg) {
    this.status = 'failed';
    if (this.speedInterval) {
      clearInterval(this.speedInterval);
      this.speedInterval = null;
    }
    this.retryTimeouts.forEach(clearTimeout);
    this.retryTimeouts = [];

    this.activeRequests.forEach(({ req, stream }) => {
      try { req.destroy(); } catch (e) {}
      try { stream.end(); } catch (e) {}
    });
    this.activeRequests = [];

    this.emit('error', msg);
    this.emit('status', { status: this.status });
  }

  calculateSpeed() {
    const now = Date.now();
    this.speedWindow.push({ time: now, bytes: this.downloadedBytes });

    if (this.speedWindow.length > 5) this.speedWindow.shift();

    if (this.speedWindow.length > 1) {
      const a = this.speedWindow[0];
      const b = this.speedWindow.at(-1);

      const dt = (b.time - a.time) / 1000;
      const db = b.bytes - a.bytes;

      this.speed = dt > 0 ? Math.round(db / dt) : 0;

      if (this.totalBytes > 0 && this.speed > 0) {
        const remaining = this.totalBytes - this.downloadedBytes;
        this.eta = Math.round(remaining / this.speed);
      } else {
        this.eta = -1;
      }
    }
  }

  pause() {
    this.isPaused = true;
    this.status = 'paused';

    if (this.speedInterval) {
      clearInterval(this.speedInterval);
      this.speedInterval = null;
    }

    this.retryTimeouts.forEach(clearTimeout);
    this.retryTimeouts = [];

    for (const { req, stream } of this.activeRequests) {
      try { req.destroy(); } catch (e) {}
      try { stream.end(); } catch (e) {}
    }

    this.activeRequests = [];
    this.saveManifest();
    this.emit('status', { status: this.status });
  }
}

module.exports = { SegmentedDownloader, followRedirects };
