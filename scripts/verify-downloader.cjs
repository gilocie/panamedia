const fs = require('fs');
const path = require('path');
const http = require('http');
const { SegmentedDownloader } = require('../panamedia-downloader/downloader.cjs');

const port = 3000;
const testUrl = `http://127.0.0.1:${port}/mock.bin`;
const testDir = path.join(__dirname, '..', 'temp_test');
const testFilename = 'test_50mb.bin';
const testPath = path.join(testDir, testFilename);
const mockFileSize = 50 * 1024 * 1024; // 50MB

let server;

// Start mock server supporting Range requests
function startMockServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === '/mock.bin') {
        res.setHeader('Accept-Ranges', 'bytes');
        
        const range = req.headers.range;
        if (range) {
          const match = range.match(/bytes=(\d+)-(\d+)?/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : mockFileSize - 1;
            const chunkSize = end - start + 1;
            
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${mockFileSize}`,
              'Content-Length': chunkSize,
              'Content-Type': 'application/octet-stream'
            });
            
            // Send chunk data in parts to simulate transfer time
            const buffer = Buffer.alloc(Math.min(chunkSize, 64 * 1024), 'y');
            let written = 0;
            
            const writeMore = () => {
              if (written >= chunkSize) {
                res.end();
                return;
              }
              const toWrite = Math.min(chunkSize - written, buffer.length);
              const ok = res.write(buffer.slice(0, toWrite));
              written += toWrite;
              if (ok) {
                setTimeout(writeMore, 15); // simulate slower local speed
              } else {
                res.once('drain', writeMore);
              }
            };
            writeMore();
          } else {
            res.writeHead(400);
            res.end();
          }
        } else {
          // Standard full download
          res.writeHead(200, {
            'Content-Length': mockFileSize,
            'Content-Type': 'application/octet-stream'
          });
          const buffer = Buffer.alloc(64 * 1024, 'y');
          let written = 0;
          const writeAll = () => {
            if (written >= mockFileSize) {
              res.end();
              return;
            }
            const ok = res.write(buffer);
            written += buffer.length;
            if (ok) {
              setTimeout(writeAll, 15);
            } else {
              res.once('drain', writeAll);
            }
          };
          writeAll();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    
    server.listen(port, '127.0.0.1', () => {
      console.log(`Mock file server started on http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

async function runVerification() {
  console.log('--- Starting Downloader Verification ---');
  
  await startMockServer();
  
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const task = {
    id: 'verify_task',
    url: testUrl,
    filename: testFilename,
    saveDir: testDir,
    connections: 4,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  };

  const downloader = new SegmentedDownloader(task);

  downloader.on('status', (data) => {
    console.log(`[Status Change] -> ${data.status}`);
  });

  downloader.on('progress', (data) => {
    const percent = data.totalBytes > 0 ? ((data.downloadedBytes / data.totalBytes) * 100).toFixed(1) : 0;
    console.log(`[Progress] Downloaded: ${percent}%`);
  });

  // 1. Prepare downloader
  console.log('Preparing downloader...');
  await downloader.prepare();
  console.log(`File details: Size=${downloader.totalBytes} bytes | Ranges Supported=${downloader.isRangeSupported}`);

  if (downloader.totalBytes !== mockFileSize) {
    throw new Error(`Size mismatch: expected ${mockFileSize}, got ${downloader.totalBytes}`);
  }

  // 2. Start downloading
  console.log('Starting download...');
  downloader.start();

  // 3. Simulate Pause after 150ms (interruption simulation)
  await new Promise(resolve => setTimeout(resolve, 150));
  console.log('\n--- SIMULATING NETWORK INTERRUPTION (PAUSE) ---');
  downloader.pause();
  console.log('Downloader paused.');
  
  // Verify that segment files exist and have progress
  const partsDir = testPath + '.parts';
  const manifestPath = path.join(partsDir, 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest file was not saved!');
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log('Manifest segments verification:', manifest.segments);

  // 4. Resume
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('\n--- RESUMING DOWNLOAD ---');
  
  const resumeDownloader = new SegmentedDownloader(task);
  
  resumeDownloader.on('status', (data) => {
    console.log(`[Resume Status] -> ${data.status}`);
  });

  resumeDownloader.on('progress', (data) => {
    const percent = data.totalBytes > 0 ? ((data.downloadedBytes / data.totalBytes) * 100).toFixed(1) : 0;
    console.log(`[Resume Progress] Downloaded: ${percent}%`);
  });

  resumeDownloader.on('completed', () => {
    console.log('\n--- DOWNLOAD COMPLETED ---');
    verifyFileIntegrity();
  });

  resumeDownloader.on('error', (err) => {
    console.error('Resume error:', err);
    server.close();
    process.exit(1);
  });

  await resumeDownloader.prepare();
  resumeDownloader.start();
}

function verifyFileIntegrity() {
  console.log('Verifying integrity of final file...');
  if (!fs.existsSync(testPath)) {
    console.error('FAIL: Final file does not exist!');
    server.close();
    process.exit(1);
  }

  const stat = fs.statSync(testPath);
  console.log(`Final file size: ${stat.size} bytes`);
  
  if (stat.size === mockFileSize) {
    console.log('SUCCESS: File downloaded completely with correct size!');
    
    // Check if the contents are all 'y'
    const content = fs.readFileSync(testPath);
    let allMatch = true;
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== 121) { // ASCII code for 'y'
        allMatch = false;
        break;
      }
    }
    
    if (allMatch) {
      console.log('SUCCESS: File content verified perfectly! No data corruption.');
    } else {
      console.error('FAIL: Content corruption detected!');
    }

    // Cleanup test
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('Cleaned up test directory.');
    
    // Close server
    server.close(() => {
      console.log('Mock server closed.');
      process.exit(allMatch ? 0 : 1);
    });
  } else {
    console.error(`FAIL: File size mismatch. Expected ${mockFileSize}, got ${stat.size}`);
    server.close();
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Verification failed with error:', err);
  if (server) server.close();
  process.exit(1);
});
