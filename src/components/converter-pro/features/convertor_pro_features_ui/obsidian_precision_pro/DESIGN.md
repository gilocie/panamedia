---
name: Obsidian Precision Pro
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#ffb0cd'
  on-tertiary: '#640039'
  tertiary-container: '#ff79b4'
  on-tertiary-container: '#780047'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#ffd9e4'
  tertiary-fixed-dim: '#ffb0cd'
  on-tertiary-fixed: '#3e0022'
  on-tertiary-fixed-variant: '#8c0053'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  tech-timecode:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.04em
  tech-data:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for prosumer and professional multimedia creators working in high-throughput video encoding, audio mastering, batch transcoding, and rapid editing environments. The aesthetic blends the utilitarian ergonomics of non-linear editors (DaVinci Resolve, Premiere Pro) with the sleek, polished responsiveness of Windows 11 Fluent Design and high-performance Electron desktop architecture.

### Brand Personality & Mood
- **Hyper-Focused & Utilitarian:** Interfaces retreat into deep, non-distracting obsidian and navy depths so visual previews, color grading, and waveform timelines command immediate focus.
- **Precision Engineering:** Crisp hairline dividers, strict bounding boxes, and monospaced telemetry tokens instill trust during mission-critical conversions.
- **Electric Responsiveness:** High-luminance neon cyan and vibrant violet micro-accents signify active hardware acceleration, ongoing encoding pipelines, and live media playback.

### Design Movement
- **Fluent Dark Utilitarianism:** Seamlessly fuses Fluent Design dark mica/acrylic backdrop transparency with flat, low-contrast desktop utility panes. Surfaces rely on tight border hierarchies (`#1E293B`, `#334155`), controlled glow gradients, and subtle elevation rather than heavy drop shadows.

## Colors

The color palette is calibrated specifically for long-session editing in low-light studios, preventing eye fatigue while ensuring rapid recognition of rendering statuses, codec types, and audio-video streams.

### Surface Tiers
- **Canvas Base (`#0B0F19`):** Master window foundation, titlebar backdrop, and outer shell.
- **Surface Elevation 1 (`#111827`):** Side panels, preview monitor container, timeline staging, and batch queue tracks.
- **Surface Elevation 2 (`#1E293B`):** Active card headers, segmented control backgrounds, collapsed parameter boxes, and input field foundations.
- **Surface Elevation 3 (`#334155`):** Hover states, active scrubbing thumb tracks, secondary button backdrops, and active tab indicators.

### Accent & Functional Semantics
- **Electric Cyan (`#06B6D4`, `#22D3EE`):** Primary system driver. Designates primary actions, completed conversion queues, active transport controls, and playback scrub heads.
- **Cosmic Violet (`#8B5CF6`, `#A855F7`):** Creative and post-processing tools (LUT filters, trim handles, audio stream switches, and hardware acceleration indicators).
- **Pulse Magenta (`#EC4899`):** High-priority badges, destructive warning dismissals, and live recording highlights.
- **System Borders (`#1E293B` Base, `#334155` Interactive):** Crisp 1px structural framing separating transport docks, batch tables, and monitor monitors.

## Typography

The typography hierarchy balances clean UI readability with strict technical telemetry.

- **Primary UI (Inter):** Handles application navigation, modal titles, tooltips, buttons, and setting labels. Neutral, highly legible at micro sizes, and optimized for screen rendering.
- **Technical & Timecodes (JetBrains Mono):** Mandatory for frame rates (`29.97 fps`, `59.94 fps`), bitrates (`192 kbps`, `45 Mbps`), resolutions (`3840x2160`), file sizes, and playback timecodes (`00:01:24:18`). Tabular figures ensure that numbers do not jitter during live scrubbing or conversion progress updates.
- **Labels & Micro-Badges:** Rendered in uppercase or bold compact styling with expanded letter spacing for immediate visual parsing during intensive rendering sessions.

## Layout & Spacing

Desktop utility workflows require maximum information density without visual chaos. This system employs an asymmetrical docked layout strategy optimized for wide screen desktop displays.

### Workspace Architecture
- **Global Header / Titlebar:** 44px fixed height. Houses custom Windows 11 window controls, project status, global hardware indicators, and master task state.
- **Main Shell Layout:** 
  - **Left / Center Work Area (Flexible 60-70%):** Queue item lists, timeline segments, batch conversion cards, and multi-track workflows.
  - **Right Inspector Panel (Fixed 340px - 400px):** Media preview monitor, audio decibel meters, encoder parameters, and hardware toggles.
  - **Bottom Dock (Fixed 88px):** Quick-action tool palette (Cut/Trim, Crop, Subtitle, Effects, Rotate, Watermark, GIF) and master execution trigger.
- **Spacing Rhythm:** Standard spacing increments adhere to a 4px sub-grid, with 8px (`space-sm`) and 12px (`space-md`) serving as default panel insets and element gaps. Margins remain tight (16px) to maximize preview and timeline real estate.

## Elevation & Depth

Visual hierarchy is constructed through tonal nesting, subtle 1px border frames, and localized luminous glows rather than traditional diffuse drop shadows.

### Elevation Hierarchy
- **Level 0 (App Canvas `#0B0F19`):** Completely flat base.
- **Level 1 (Docked Panels `#111827`):** Inset with a crisp 1px solid border of `#1E293B`. No shadow.
- **Level 2 (Cards & Queue Rows `#161F30`):** Outlined with `#1E293B` or `#2A384C`. Hovering shifts border luminance to `#0891B2` (Cyan 600).
- **Level 3 (Floating Windows, Context Menus, Tooltips):** Background `#1E293B`, 1px border `#334155`, backed by a crisp 8px ambient blur shadow: `0 12px 28px -4px rgba(0, 0, 0, 0.65)`.
- **Neon Glow Focus:** Primary execution buttons, active scrub heads, and hardware acceleration badges utilize cyan and violet radial glow rings (`0 0 16px rgba(6, 182, 212, 0.45)` and `0 0 16px rgba(139, 92, 246, 0.45)`) to signal active pipeline status.

## Shapes

The interface embraces the refined geometry of Windows 11 Fluent styling: deliberate, soft corner radiuses that look modern and desktop-native without wasting screen space.

### Curvature Hierarchy
- **Micro Elements (2px - 4px):** Code badges, timecode pills, scrubber handles, progress bars, and segmented track buttons.
- **Standard Controls (6px - 8px / `roundedness: 1`):** Action buttons, input fields, dropdown menus, and queue tool cards.
- **Panels & Overlays (8px - 10px):** Inspector sidebars, preview monitor wrappers, and modal windows.
- **Pill Badges (`9999px`):** Status indicators, stream type tags (e.g., `MP3 • 192k`, `Hi-Fi Audio`), and circular execution triggers.

## Components

### Buttons & Master Execution Controls
- **Master Action / Convert Button:** Circular or prominent pill button positioned in the lower command dock. Styled with a vivid cyan-to-violet linear gradient border, radial backdrop glow, white icon, and high-contrast typography.
- **Tool Deck Buttons:** Inset card buttons (64px x 64px) arranged in a horizontal lower dock. Feature a 20px cyan/violet duotone icon, bold title, and micro subtext (e.g., `Cut / Trim` > `Trim clip range`). Background `#111827`, border `#1E293B`, transition to `#1E293B` with cyan highlight on hover.
- **Secondary / Ghost Buttons:** Solid `#1E293B` fill or transparent with `#334155` outline, hover states brighten border to `#22D3EE`.

### Conversion Queue Cards
- Compact horizontal row layout displaying source thumbnail with codec badge overlay (`MP4`, `MKV`, `WAV`), source/target file path, dynamic codec conversion indicator (`MP3 • 192k` with animated gradient progress fill), and inline transport controls (Pause, Cancel, Settings).
- Progress bar uses a dual-tone cyan-to-magenta gradient track with remaining percentage rendered in JetBrains Mono.

### Preview Monitor & Scrubbers
- 16:9 video frame with 1px border `#334155` and letterboxed presentation.
- Precision scrubber timeline featuring high-contrast timecode displays (`0:00 / 3:00`), mini waveform/keyframe background ticks, and an interactive cyan scrub head with hover tooltip time previews.

### Chips & Technical Codec Badges
- Pill-shaped badges with semi-transparent tinted backgrounds. Cyan tint for primary output parameters (`#06B6D4` at 15% fill with solid cyan border), violet tint for audio configurations (`#8B5CF6` at 15% fill).
- Monospaced technical typography (`tech-data`) to display sample rates, channels, and frame rates.

### Checkboxes, Toggles & Hardware Switches
- Windows 11 style rounded-corner check boxes (4px radius). Checked state uses solid `#06B6D4` with white checkmark.
- Technical feature cards (e.g., `Enable GPU Hardware Encoder`) display custom toggle cards with hardware status tags (`CPU ONLY` / `CUDA ACTIVE`).