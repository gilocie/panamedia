# Panamedia Pro

> **Version 1.0.1**
> *The All-in-One Professional Media Player, Transcoder, YouTube/Web Downloader & Flash Drive Dispatcher.*

---

## Overview

**Panamedia Pro** is a desktop media application designed for high-performance audio and video playback, fast video transcoding, audio extraction, web media downloading, and physical storage dispatch (USB Flash Drives and External HDDs).

Powered by **Electron**, **React 19**, **TypeScript**, and **FFmpeg/FFprobe**, Panamedia Pro delivers a clean, dark-mode user interface with a self-healing media library that automatically detects and removes missing files. Currently available for **Windows 10 and Windows 11** only.

---

## Key Features

### Panamedia Player

- **Adaptive Ultra-Smooth Seeking** - Precision frame seeking across files of any size or duration without playback stutter or unwanted restarting.
- **Dynamic Titlebar Integration** - Real-time media title tracking, instant responsive window drag regions, and integrated Converter Pro progress card.
- **Floating Mini-Player & Sidebar Dock** - Unobtrusive playback while multitasking, full volume normalization, and background audio streaming.
- **Playlist Management & PIN Security** - Categorize public playlists, mark favorites, and securely lock sensitive media files behind PIN-protected archives.
- **Self-Healing Library** - Missing files are detected automatically, silently removed from the playlist and all storage layers, and playback skips to the next available track - no user action needed.
- **30-Minute Auto-Validation** - Every 30 minutes both the main library and player playlist validate all known file paths against the disk and prune any that no longer exist.
- **Fade Background on Load** - Blurred backdrop thumbnail renders while media is buffering for a polished loading experience.

---

### YouTube & Web Downloader — Full Reference

The downloader is a fully self-contained download engine supporting YouTube, social platforms, and any publicly streamable website. It auto-selects the best download engine per URL from three available engines.

#### Download Engines

| Engine | Used For |
|--------|---------|
| **yt-dlp (YouTube Isolated)** | All YouTube URLs — fetches best video+audio streams separately and merges them with FFmpeg |
| **yt-dlp Multi-Stream Merger** | Facebook, Instagram, TikTok, X/Twitter, Reddit, Threads, Pinterest, Vimeo, Dailymotion — social platform extractor |
| **Custom Segmented Downloader** | Direct file URLs and HLS streams — splits the file into parallel byte-range chunks |

#### Adding Downloads

| Method | How |
|--------|-----|
| **Paste URL** | Paste any video/audio link into the URL bar and select a format |
| **In-App Browser** | Browse to any website inside the built-in browser and click the Download button |
| **YouTube Playlist** | Paste a playlist URL to batch-download all videos in one go |
| **Browser Extension** | Install the Panamedia Chrome/Edge extension — one-click download from any tab via native messaging bridge on port 52321 |

#### In-App Browser

- Built-in Electron webview with navigation bar (back, forward, reload, URL input).
- Pre-configured site shortcuts: **YouTube**, **MovieBox**, **TikTok** — plus any custom site you add.
- Add custom streaming sites: set a name, URL, and choose between the site's own favicon or a preset icon.
- **Download Video** button appears when a streamable page is detected.
- **Download Playlist** button appears automatically when a YouTube playlist URL is detected.

#### Supported Social Platforms

YouTube · Facebook · Instagram · TikTok · X (Twitter) · Reddit · Threads · Pinterest · Vimeo · Dailymotion · MovieBox · and any site supported by yt-dlp generic extractor.

#### Format Selection

Before any download starts a format picker modal lets you choose:

**Video formats:** Best Quality · 1080p · 720p · 480p · 360p
**Audio-only:** MP3 (re-encoded) · M4A (raw AAC stream, no re-encode)

#### Active Downloads Panel

- Full download list with filename, format badge, file size, progress bar, speed, and ETA.
- Status badges: `Queued` · `Preparing` · `Downloading` · `Paused` · `Merging` · `Compressing` · `Completed` · `Failed`
- **Resume All** — restart all paused downloads at once.
- **Pause All** — pause every active download simultaneously.
- **Clear History** — remove completed entries from the list (files stay on disk).
- Auto-generated video thumbnail from FFmpeg for every completed file.
- Download completion toast notification.

#### Queue Manager (Queue Scheduler)

- All queued tasks wait in the scheduler until a concurrent slot opens.
- Configurable **Maximum Concurrent Downloads** (1 – 4 simultaneous).
- View pending queue items in a table: filename, source URL, status.
- Manually start or delete any queued item before it begins.

#### Segmented Downloader Engine

- Splits direct file downloads into parallel byte-range chunks (default: 8 connections per file).
- Follows HTTP redirects up to 10 levels deep.
- Reads `Content-Disposition` headers to detect the correct filename automatically.
- Merges segments seamlessly after all chunks complete.
- Configurable connections per download: 2 · 4 · 8 (default) · 16 · 32.

#### Auto-Compress on Download

- Optional setting to automatically run FFmpeg compression on completed video downloads.
- Configurable CRF quality value (0 = lossless, 51 = smallest).
- Reduces large downloads for storage-constrained devices automatically.

#### Persistence & State Recovery

- All download tasks (including progress, status, byte counts, and thumbnails) are written to `userData/downloads.json` continuously.
- On app relaunch, all incomplete downloads are restored to `Paused` state, ready to resume.
- Completed downloads are preserved in history with their generated thumbnails.
- Broadcasts download-list updates to both the main window and player window via throttled IPC (300ms debounce to prevent flooding).

#### Settings

| Setting | Options |
|---------|---------|
| **Primary Download Folder** | Browse and set any directory |
| **Parallel Connections** | 2 · 4 · 8 (default) · 16 · 32 per download |
| **Max Concurrent Downloads** | 1 · 2 (recommended) · 3 · 4 |
| **Auto-Compress** | Enable/disable with CRF slider |
| **Synced Media Folders** | Add folders for the library scanner to track |

---

### Converter Pro - Full Reference

Converter Pro is a media conversion engine embedded directly in the player. It uses FFmpeg under the hood with a custom child-process pipeline and a persistent queue that survives power loss.

#### Three-Tab Workspace

| Tab | Purpose |
|-----|---------|
| **Convert** | Active queue of files pending conversion, with per-card settings |
| **Video Output** | Browsable history of all converted video files |
| **Audio Output** | Browsable history of all extracted/converted audio files |

---

#### Queue Management

- **Accumulative Multi-File Queue** - Add files from the player, right-click playlist menu, or system file dialog. New files always append under previous ones - existing queue items are never wiped.
- **Per-Card Media Type Toggle** - Each file card has a Video/Audio mode switch. Toggling it instantly changes the output format badge on that card independently of others.
- **Per-Card Selection** - Select individual cards or use Select All to bulk-remove or batch-convert multiple files at once.
- **Individual Card Convert** - Hit the play button on any single card to start converting just that file without affecting the rest of the queue.
- **Individual Pause/Resume** - Each card conversion can be paused and resumed independently mid-progress.
- **Remove Selected / Clear All** - Bulk removal controls for clearing selected or all queued items.

---

#### Video Format Presets

| Format | Codec | Best For |
|--------|-------|----------|
| **MP4** | H.264 / AAC | Universal - TVs, phones, PC, car headunits |
| **MKV** | H.264 / AAC | Flexible container with soft subtitle track support |
| **MOV** | H.264 / AAC | Native Apple QuickTime (iPhone & Mac) |
| **WebM** | VP9 / Opus | Ultra-compressed open web streaming format |
| **AVI** | Xvid / MP3 | Legacy - older car headunits & DVD players |

**Video Quality Levels:** 360p - 480p - 720p - 1080p - 2160p (4K) - Original

---

#### Audio Format Presets

| Format | Codec | Best For |
|--------|-------|----------|
| **MP3** | MPEG-3 Audio | Universal - all players, cars & USB drives |
| **AAC** | Advanced Audio | High-fidelity stream for Apple & Android |
| **M4A** | Apple AAC | Native iTunes & Music with rich dynamics |
| **WAV** | 16-bit PCM | Uncompressed broadcast studio audio |
| **FLAC** | FLAC Lossless | Audiophile-grade 100% lossless master quality |

**Audio Bitrate Options:** 96k - 128k - 192k - 256k - 320k

---

#### Media Feature Tools (11 Tools)

Each tool opens a focused modal and bakes its settings into the FFmpeg pipeline for the selected card:

| Tool | What It Does |
|------|-------------|
| **Cut / Trim** | Frame-accurate start and end markers to trim unwanted parts or isolate scenes |
| **Crop** | Reframe to 16:9, 4:3, 1:1, or 9:16 with a zoom control to crop into the shot |
| **Subtitle** | Add or burn external subtitle tracks (.srt, .ass, .vtt) into the video stream |
| **Effect** | Adjust brightness, contrast, hue, saturation, gamma, and apply color grading filters |
| **Rotate** | Rotate by 90, 180, or 270 degrees clockwise or counter-clockwise |
| **Watermark** | Overlay a transparent brand logo (PNG) or custom copyright text onto the video |
| **Mirror & Flip** | Flip video horizontally or vertically for selfie or inverted camera footage |
| **Compress** | Shrink file size by a chosen percentage using constant-quality quantiser encoding |
| **Make GIF** | Create a lightweight animated GIF loop from any video segment (configurable FPS & width) |
| **Denoise / Vol** | hqdn3d video grain removal, afftdn audio hiss filter, loudnorm EBU R128 broadcast loudness normalization |
| **Split File** | Split long clips into numbered sequential segments of a configurable duration |

---

#### Export Settings Panel

| Option | Description |
|--------|-------------|
| **Hardware Acceleration** | Enables GPU encoding via NVIDIA CUDA, Intel QSV, or AMD VCE  |
| **High Quality Engine** | Uses slower but higher-quality FFmpeg encoding presets (slow / veryslow) |
| **Deinterlacing** | Removes interlace artifacts from broadcast / captured footage |
| **Auto Stream Copy** | Copies video or audio streams without re-encoding when no quality change is needed |
| **Merge Files** | Concatenates all queue items into a single output file |

> Hardware Acceleration is automatically disabled on CPU-only machines. The engine falls back gracefully to software encoding (libx264/libx265) without any user action needed.

---

#### Integrated Preview Monitor

- Embedded mini-player inside Converter Pro showing a live preview of the selected queue file.
- Syncs play/pause state with the main Panamedia Player via IPC so both stay in sync.
- Displays audio album art thumbnails when previewing audio-mode cards.
- Previous / Next file navigation directly from the preview monitor.
- Volume control with mute toggle independent from the main player.

---

#### Output Management

- **Dedicated output directories** - Automatically creates Documents\Panamedia\Video Output and Documents\Panamedia\Audio Output.
- **Real-time output tracking** - The Video Output and Audio Output tabs poll the output folders and instantly show new files with size, format, resolution/bitrate, and date.
- **Bulk selection & delete** - Select multiple output files and delete them in one click.
- **Direct Send from Output** - Transfer any converted file directly to a USB drive or Sendtray without re-conversion.
- **Change Output Path** - Redirect where converted files are saved at any time.
- **Open Output Folder** - One-click reveal in Windows Explorer.

---

#### Persistence & Power-Loss Recovery

- All queue items, per-card media types, format selections, bitrate settings, hardware acceleration toggles, and tool configurations are written to disk continuously.
- If the system reboots or loses power mid-conversion, the full queue and its progress state are restored automatically on next launch.
- A recovery notification banner appears in the player titlebar when a batch resumes.

---

### USB Flash Drive & Sendtray Dispatch

- **Auto Flash Drive Discovery** - Instant detection and status polling of plugged-in removable drives.
- **Direct Copy & Transcode-on-Send** - Export original media or convert directly into standard flash-compatible formats on the fly.
- **Sendtray Queue** - Temporary holding area for multi-source batch transfers to any destination.

---

### Media Library (Main App)

- Scans all configured sync folders recursively and populates the library panel.
- Tabs: Primary (Downloads), Videos, Audios, Docs, Files.
- Folder View and Files List view modes.
- **Find & Remove Duplicates** - Server-side duplicate detection groups files by normalized name. Oldest duplicate in each group is pre-selected for removal.
- **30-minute auto-validation** - Library silently re-checks all file paths and removes missing entries every 30 minutes.
- **Sync button** - Instantly rescans all sync folders and re-validates every known file against disk.

---

### Archive & PIN Protection

- Mark any media file as "Archived" to hide it from the standard library view.
- Set a custom PIN code to lock access to archived content.
- OS-level hidden+system attribute applied via attrib to archived folders on Windows for extra protection.

---

## Architecture

```
panamedia-pro/
├── electron.cjs              # Main process - IPC handlers, settings, sync, validate
├── preload.cjs               # Context bridge - whitelisted IPC channels
├── electron/
│   ├── player-manager.cjs    # Player window lifecycle management
│   ├── converter-manager.cjs # FFmpeg conversion pipeline & queue
│   ├── playback-support.cjs  # Transcode cache & streaming server
│   └── core-client.cjs       # C++ engine client (fast directory scanner)
├── panamedia-downloader/
│   ├── downloadManager.cjs   # Download queue, persistence, progress tracking
│   └── youtube.cjs           # yt-dlp wrapper, format extraction
└── src/
    ├── components/
    │   ├── panamedia/
    │   │   ├── hooks/
    │   │   │   ├── useMediaLibrary.ts  # Player playlist state, sync, 30-min validation
    │   │   │   └── usePlayerShortcuts.ts
    │   │   ├── VideoScreen.tsx
    │   │   ├── PlaylistPanel.tsx
    │   │   └── PlayerControls.tsx
    │   ├── converter-pro/
    │   │   ├── ConvertQueueList.tsx     # Queue cards with per-card controls
    │   │   ├── PreviewMonitor.tsx       # Embedded preview player
    │   │   ├── OutputHistoryList.tsx    # Output file browser
    │   │   ├── FormatSettingsModal.tsx  # Format & quality picker
    │   │   ├── ExportSettingsPanel.tsx  # HW accel & engine options
    │   │   ├── ConverterBottomDock.tsx  # Tool picker + convert button
    │   │   ├── TopTabsBar.tsx           # Convert / Video Output / Audio Output tabs
    │   │   └── features/
    │   │       ├── CutTrimTool.tsx
    │   │       ├── CropTool.tsx
    │   │       ├── SubtitleTool.tsx
    │   │       ├── EffectTool.tsx
    │   │       ├── RotateTool.tsx
    │   │       ├── WatermarkTool.tsx
    │   │       ├── CompressTool.tsx
    │   │       ├── GifTool.tsx
    │   │       ├── DenoiseTool.tsx
    │   │       └── SplitTool.tsx
    │   └── panamediaPlayer.tsx
    └── hooks/
        ├── useLibrary.ts         # Main app library state, sync, 30-min validation
        └── useSettings.ts        # App settings management
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Electron |
| **Frontend** | React 19, TypeScript |
| **Build Tool** | Vite |
| **Styling** | Vanilla CSS, Glassmorphic Design System, Lucide Icons |
| **Media Engine** | Native FFmpeg & FFprobe binaries with custom child-process pipeline |
| **Fast Scanner** | C++ core engine with directory-mtime caching (falls back to Node) |
| **State & Persistence** | LocalStorage sync, Electron IPC, persistent disk state in userData |
| **Downloader** | yt-dlp wrapper with native messaging bridge |

---

## Platform Availability

| Platform | Status |
|----------|--------|
| **Windows 10 / 11** | Available - Version 1.0.1 |
| **macOS** | Coming Soon |
| **Linux** | Coming Soon |
| **Android** | Coming Soon |
| **iOS** | Coming Soon |

> This release is **Windows only**. macOS, Linux, and mobile versions are currently in planning. Other platform users please wait for future release announcements.

---
## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm

### Installation

```bash
git clone https://github.com/gilocie/panamedia.git
cd panamedia
npm install
```

### Running in Development

```bash
npm run electron-dev
```

### Building for Production

```bash
npm run dist
```

---

## Release Notes



### Version 1.0.1 — Windows Only
- **Self-Healing Library** - Missing files are automatically removed from the playlist, favourites, archive, download index, and Settings sync folders. Playback skips to the next available track.
- **30-Minute Auto-Validation** - Both the main app library and player playlist silently validate all known paths every 30 minutes.
- **Sync Button Enhanced** - Sync now validates existing files against disk before updating library state.
- **Disk Cache Fix** - Resolved Chromium internal cache error on startup.
- **Enhanced Converter Pro Persistence** - Per-file media modes, format presets, bitrates, and hardware acceleration options persist across restarts and power loss.
- **Power-Loss Recovery** - Conversion status and file queues survive sudden power loss and restore automatically on relaunch.
- **Output Tab Direct Send** - Direct Send button on Video and Audio output tabs is enabled when output files exist.
- **Fix Player Seeking** - Seamless seeking on large and long-duration video files.
- **Queue Accumulation** - Adding files always appends without replacing existing queue items.

---

## License

Proprietary software developed by Panamedia. All rights reserved.






