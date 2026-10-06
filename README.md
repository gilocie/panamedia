# Panamedia Pro

> **Version 1.0.2**
> *The All-in-One Professional Media Player, Transcoder, YouTube/Web Downloader & Flash Drive Dispatcher.*

---

## Overview

**Panamedia Pro** is an enterprise-grade desktop media workstation designed for high-performance audio and video playback, fast video transcoding, audio extraction, web media downloading, and physical storage dispatch (USB Flash Drives and External HDDs).

Powered by **Electron**, **React 19**, **TypeScript**, and **FFmpeg/FFprobe**, Panamedia Pro delivers a sleek, dark-mode glassmorphic user interface with a self-healing media library that automatically detects and removes missing files.

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

### Converter Pro - Full Reference

Converter Pro is a VideoProc-style conversion engine embedded directly in the player. It uses FFmpeg under the hood with a custom child-process pipeline and a persistent queue that survives power loss.

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
| **Hardware Acceleration** | Enables GPU encoding via NVIDIA CUDA, Intel QSV, or AMD VCE (up to 47x faster exports) |
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

### YouTube & Web Downloader

- Download videos and audio from YouTube and hundreds of other websites.
- Format selection (best quality, 1080p, 720p, audio-only MP3/AAC) before download starts.
- Active downloads visible in the Queue Manager with live progress, speed, and ETA.
- Pause, resume, and cancel individual downloads.
- Browser extension integration via native messaging for one-click downloads from Chrome/Edge.

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

### Version 1.0.2
- **Self-Healing Library** - When a media file is missing from disk, it is automatically removed from the playlist, favourites, archive, download index, and Settings sync folders. Playback skips to the next available track automatically.
- **30-Minute Auto-Validation** - Both the main app library and player playlist run a background validation every 30 minutes to prune missing files silently.
- **Sync Button Enhanced** - Clicking sync now validates every existing file against disk before updating the library state.
- **Disk Cache Fix** - Resolved Chromium Unable to create cache error by setting an explicit 256 MB cache size cap.
- **Cross-Window Sync** - media-path-removed IPC event broadcasts path removals to all open windows (main app + player) instantly.

### Version 1.0.1
- **Enhanced Converter Pro Persistence** - Per-file media modes (Audio vs Video), format presets, bitrates, and hardware acceleration options now persist across app restarts and power outages.
- **Power-Loss Recovery** - Conversion status, active batch progress, and file queues survive sudden power loss and display instant recovery notifications on the player header.
- **Output Tab Direct Send** - Direct Send button on converted Video and Audio output tabs is now intelligently enabled when output files exist.
- **Fix Player Seeking** - Restructured video element timeupdate and seeking pipeline to support seamless seeking on large and long-duration video files.
- **Queue Accumulation** - Right-clicking songs or adding files now continuously appends under previous items without replacing existing files.

---

## License

Proprietary software developed by Panamedia. All rights reserved.
