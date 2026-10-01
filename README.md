# Panamedia Pro

> **Version 1.0.1**  
> *The All-in-One Professional Media Player, Transcoder, YouTube/Web Downloader & Flash Drive Dispatcher.*

---

## 🚀 Overview

**Panamedia Pro** is an enterprise-grade desktop media workstation designed for high-performance audio and video playback, fast video transcoding, audio extraction, web media downloading, and physical storage dispatch (USB Flash Drives and External HDDs).

Powered by **Electron**, **React 19**, **TypeScript**, and **FFmpeg/FFprobe**, Panamedia Pro delivers GPU-accelerated performance with a sleek, dark-mode glassmorphic user interface.

---

## ✨ Key Features

### 🎬 Panamedia Player
- **Adaptive Ultra-Smooth Seeking**: Precision frame seeking across files of any size or duration (from short clips to multi-hour 4K films) without playback stutter or unwanted restarting.
- **Dynamic Titlebar Integration**: Real-time media title tracking, instant responsive window drag regions, and integrated Converter Pro progress card.
- **Floating Mini-Player & Sidebar Dock**: Unobtrusive playback while multitasking, full volume normalization, and background audio streaming.
- **Playlist Management & Pin Security**: Categorize public playlists, mark favorites, and securely lock sensitive media files behind PIN-protected archives.

### ⚡ Converter Pro (VideoProc-Style Media Engine)
- **High-Performance Transcoding**: Fast conversion across modern video and audio containers (`MP4`, `MKV`, `MOV`, `WEBM`, `AVI`, `MP3`, `AAC`, `FLAC`, `WAV`, `OGG`).
- **One-Click Audio Extraction**: Switch any video card from `Video` to `Audio` mode (`MP3 • 320k Hi-Fi Audio`, etc.) with instant live badge updates.
- **Hardware Acceleration (GPU Enabled)**: Seamless hardware-accelerated encoding supporting **NVIDIA CUDA**, **Intel QSV**, and **AMD VCE** (up to 47× faster exports).
- **Persistent Queue & Power-Loss Recovery**: 
  - Queued media items and individual per-card settings (`Audio` vs `Video`, target format, bitrate, GPU acceleration, and engine toggles) are continuously persisted to disk.
  - If the computer reboots or experiences a sudden power loss, the queue, converting status, and current progress are restored automatically on relaunch.
- **Accumulative Multi-File Queue**: Add files repeatedly from the player, playlist context menu, or system file dialog—new files always append under previous ones without wiping your work.
- **Dedicated Media Feature Tools**:
  - **Cut / Trim**: Frame-accurate start/end time markers.
  - **Crop**: 16:9, 4:3, Zoom, and custom dimension cropping.
  - **Subtitles**: Embed external `.srt` tracks into video files.
  - **Visual Effects**: Contrast, saturation, gamma, and color filters.
  - **Rotate**: 90°, 180°, and 270° clockwise/counter-clockwise orientation fixes.
  - **Watermark**: Overlay custom brand PNG logos and text watermarks.
  - **Mirror & Flip**: Horizontal and vertical orientation mirroring.
  - **Compressor**: Target file-size bitrate compression.

### 📁 Output Management & Direct Send
- **Dedicated Output Locations**: Automatic generation of `Documents\Panamedia\Video Output` and `Documents\Panamedia\Audio Output` directories.
- **Real-Time Output File Tracking**: Instantaneous folder inspection with file size, format, and modification date metadata.
- **Direct Send from Outputs**: Directly transfer converted videos and extracted audios to USB drives or Sendtray without re-conversion.

### 🚀 USB Flash Drive & Sendtray Dispatch
- **Auto Flash Drive Discovery**: Instant detection and status polling of plugged-in removable drives.
- **Direct Copy & Transcode-on-Send**: Export original media or convert directly into standard flash-compatible formats on the fly.
- **Sendtray Queue**: Temporary holding area for multi-source batch transfers.

---

## 🛠️ Tech Stack & Architecture

- **Runtime**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/)
- **Styling**: Vanilla CSS, Glassmorphic Design System, Lucide Icons
- **Media Engine**: Native FFmpeg & FFprobe binaries with custom child process pipeline
- **State Management & Persistence**: LocalStorage sync, Electron IPC IPCMain/IPCRenderer, and persistent disk state in `userData`

---

## 📦 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/gilocie/panamedia.git

# Install dependencies
npm install
```

### Running in Development
```bash
# Start Vite frontend and Electron main process in concurrent dev mode
npm run electron-dev
```

### Building for Production
```bash
# Build production bundle and portable NSIS Windows installer
npm run dist
```

---

## 📝 Release Notes

### Version 1.0.1
- **Enhanced Converter Pro Persistence**: Per-file media modes (`Audio` vs `Video`), format presets, bitrates, and hardware acceleration options now persist across app restarts and power outages.
- **Power-Loss Recovery**: Conversion status, active batch progress, and file queues survive sudden power loss and display instant recovery notifications on the player header.
- **Output Tab Direct Send**: Direct Send button on converted Video and Audio output tabs is now intelligently enabled when output files exist, opening the Send modal while cleanly hiding the redundant Convert option.
- **Fix Player Seeking**: Restructured video element timeupdate and seeking pipeline to support seamless seeking on large and long-duration video files.
- **Queue Accumulation**: Right-clicking songs or adding files now continuously appends under previous items without replacing existing files.

---

## 📄 License

Proprietary software developed by Panamedia. All rights reserved.
