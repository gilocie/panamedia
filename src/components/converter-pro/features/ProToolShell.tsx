import React, { createContext, useContext, useEffect, useState } from 'react';
import { ArrowLeft, PanelRightOpen, Settings2, X } from 'lucide-react';



export interface ProTab {
  id: string;
  label: string;
  accent: string;
  icon: React.ReactNode;
}

/* ─── Studio context ──────────────────────────────────────────────────
   Lets the tab strip live in the shell while the orchestrator stays the
   single source of truth for which tool is active. */

interface StudioCtx {
  tabs: ProTab[];
  activeId: string;
  onSelect: (id: string) => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (node: React.ReactNode) => void;
}

const StudioContext = createContext<StudioCtx | null>(null);

export const ProToolStudioProvider: React.FC<{
  tabs: ProTab[];
  activeId: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}> = ({ tabs, activeId, onSelect, children }) => {
  const [headerSlot, setHeaderSlot] = useState<React.ReactNode>(null);
  return (
    <StudioContext.Provider value={{ tabs, activeId, onSelect, headerSlot, setHeaderSlot }}>
      {children}
    </StudioContext.Provider>
  );
};

/* ─── Media header ─────────────────────────────────────────────────── */

export interface ProMediaMeta {
  /** e.g. "1080p60" */
  resolution?: string;
  /** e.g. "428 MB" */
  size?: string;
  /** e.g. "03:42.18" */
  duration?: string;
  /** e.g. "H.264 / AAC 320kbps" */
  codec?: string;
  status?: string;
}

interface ProMediaBarProps {
  fileName: string;
  meta?: ProMediaMeta;
  onBack: () => void;
  onDetach?: () => void;
  onGlobalSettings?: () => void;
}

export const ProMediaBar: React.FC<ProMediaBarProps> = ({
  fileName,
  meta,
  onBack,
  onDetach,
  onGlobalSettings
}) => {
  const display = fileName.split(/[\\/]/).pop() || fileName;
  const facts = [meta?.resolution, meta?.size, meta?.duration, meta?.codec].filter(Boolean);

  return (
    <header className="pro-media-bar">
      <button type="button" className="pw-btn pw-btn--quiet" onClick={onBack} aria-label="Back to queue">
        <ArrowLeft size={15} />
        <span style={{ fontWeight: 600 }}>Queue</span>
      </button>

      <div className="pro-media-bar__id">
        <span className="pro-media-bar__name" title={fileName}>{display}</span>
        {meta?.status && <span className="pw-badge">{meta.status}</span>}
        {facts.length > 0 && (
          <span className="pw-data pro-media-bar__facts">
            {facts.map((f, i) => (
              <React.Fragment key={f}>
                {i > 0 && <span className="pro-media-bar__dot">•</span>}
                <span>{f}</span>
              </React.Fragment>
            ))}
          </span>
        )}
      </div>

      <div className="pro-row" style={{ gap: 8 }}>
        {onDetach && (
          <button type="button" className="pw-btn" onClick={onDetach}>
            <PanelRightOpen size={13} /> Detached Preview
          </button>
        )}
        {onGlobalSettings && (
          <button type="button" className="pw-btn" onClick={onGlobalSettings}>
            <Settings2 size={13} /> Global Settings
          </button>
        )}
      </div>
    </header>
  );
};

/* ─── Tool tab strip ───────────────────────────────────────────────── */

const ProTabStrip: React.FC<{ ctx: StudioCtx; onBack?: () => void }> = ({ ctx, onBack }) => (
  <nav className="pro-tabs" role="tablist" aria-label="Converter Pro tools">
    {/* ← Queue: discard tool and return to converter queue */}
    {onBack && (
      <button
        type="button"
        className="pro-tabs__back"
        onClick={onBack}
        title="Discard and return to queue"
      >
        <ArrowLeft size={12} />
        <span>Queue</span>
      </button>
    )}
    {ctx.tabs.map(tab => {
      const selected = tab.id === ctx.activeId;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={selected}
          className={`pro-tab${selected ? ' pro-tab--active' : ''}`}
          style={selected ? ({ '--tab-accent': tab.accent } as React.CSSProperties) : undefined}
          onClick={() => ctx.onSelect(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      );
    })}
    {/* Apply action slot — rendered here by whichever tool is active */}
    {ctx.headerSlot && (
      <div className="pro-tabs__action">{ctx.headerSlot}</div>
    )}
  </nav>
);

/* ─── Shell ────────────────────────────────────────────────────────── */

interface ProToolShellProps {
  /** Shown in the command bar; the media bar carries the real filename. */
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  /** Overrides the accent for this tool. Defaults to the app's indigo. */
  accent?: string;
  /** Extra chips rendered in the canvas panel head row. */
  badges?: React.ReactNode;
  /**
   * Body, partitioned by the zone markers: `<ProCanvas>` (left),
   * `<ProInspector>` (right), `<ProTimeline>` (full width, beneath both).
   * Anything not wrapped defaults to the canvas zone.
   */
  children: React.ReactNode;
  /** Optional header rendered at the very top of the inspector column. */
  inspectorHeader?: React.ReactNode;
  /** Command bar. */
  footerLeft?: React.ReactNode;
  footerMeta?: React.ReactNode;
  footerActionLabel: string;
  footerActionIcon?: React.ReactNode;
  onApply: () => void;
  applyDisabled?: boolean;
  onClose: () => void;
}

export const ProToolShell: React.FC<ProToolShellProps> = ({
  title,
  subtitle,
  icon,
  accent,
  badges,
  children,
  footerLeft,
  footerMeta,
  footerActionLabel,
  footerActionIcon,
  onApply,
  applyDisabled,
  onClose,
  inspectorHeader
}) => {
  const studio = useContext(StudioContext);

  // Escape leaves the tool and returns to the Convert tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Register the Apply button in the tab-strip header slot.
  // IMPORTANT: depend on studio?.setHeaderSlot (a stable useState setter),
  // NOT on studio itself (which is a new object reference on every render,
  // which would cause an infinite loop: setSlot -> re-render -> new studio
  // -> effect re-runs -> setSlot -> re-render -> ...).
  const setSlot = studio?.setHeaderSlot;
  useEffect(() => {
    if (!setSlot) return;
    setSlot(
      <button
        type="button"
        className="pro-studio__apply"
        onClick={onApply}
        disabled={applyDisabled}
        style={{ fontSize: 11, padding: '5px 14px' }}
      >
        {footerActionIcon}
        {footerActionLabel}
      </button>
    );
    return () => setSlot(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSlot, onApply, applyDisabled, footerActionLabel]);

  // Partition the body into its three zones.
  const zones = React.useMemo(() => {
    const canvas: React.ReactNode[] = [];
    const inspector: React.ReactNode[] = [];
    const timeline: React.ReactNode[] = [];
    React.Children.forEach(children, child => {
      if (!React.isValidElement(child)) {
        if (child !== null && child !== undefined && child !== false) canvas.push(child);
        return;
      }
      const props = child.props as { children?: React.ReactNode };
      if (child.type === ProInspector) inspector.push(props.children);
      else if (child.type === ProTimeline) timeline.push(props.children);
      else canvas.push(child);
    });
    return { canvas, inspector, timeline };
  }, [children]);

  const accentStyle = accent ? ({ '--tool-accent': accent } as React.CSSProperties) : undefined;
  const hasTimeline = zones.timeline.length > 0;
  const hasInspector = zones.inspector.length > 0;

  return (
    <section
      className={`pro-studio${hasTimeline ? ' pro-studio--timeline' : ''}${hasInspector ? '' : ' pro-studio--wide'}`}
      style={accentStyle}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {studio ? <ProTabStrip ctx={studio} onBack={onClose} /> : null}

      {/* ── Upper zones ── */}
      <div className="pro-studio__body">
        <div className="pro-studio__canvas">
          <div className="pro-studio__toolhead">
            <span data-tool-icon>{icon}</span>
            <span className="pro-studio__toolname">{title}</span>
            {subtitle && (
              <span className="pw-data pro-studio__sub" title={subtitle}>{subtitle.split(/[\\/]/).pop()}</span>
            )}
            {badges && <span className="pro-row pro-row--wrap pro-studio__badges">{badges}</span>}
            <button
              type="button"
              className="pw-icon-btn"
              onClick={onClose}
              aria-label={`Close ${title}`}
              style={{ marginLeft: 'auto', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
          {zones.canvas}
        </div>

        {hasInspector && (
          <div className="pro-studio__inspector">
            {inspectorHeader && (
              <div className="pro-studio__inspector-header">
                {inspectorHeader}
              </div>
            )}
            {zones.inspector}
          </div>
        )}
      </div>

      {/* ── Full-width timeline stage (compact, flex-shrink:0 keeps footer visible) ── */}
      {hasTimeline && (
        <div className="pro-studio__timeline" style={{ flexShrink: 0 }}>
          {zones.timeline}
        </div>
      )}

      {/* ── Command bar — only renders when there is something to show ── */}
      {(footerLeft || footerMeta) && (
        <footer className="pro-studio__footer">
          <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>{footerLeft}</div>
          {footerMeta && <div className="pro-studio__meta">{footerMeta}</div>}
        </footer>
      )}
    </section>
  );
};

/* ─── Zone markers ───────────────────────────────────────────────────
   The three body zones are expressed as *children* rather than props.
*/

export const ProCanvas: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const ProInspector: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const ProTimeline: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

/* ─── Panel ──────────────────────────────────────────────────────────── */

interface ProPanelProps {
  title: string;
  icon?: React.ReactNode;
  /** Right-hand slot in the panel header — badges or a text action. */
  action?: React.ReactNode;
  subtitle?: string;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const ProPanel: React.FC<ProPanelProps> = ({
  title,
  icon,
  action,
  subtitle,
  flush,
  className = '',
  children
}) => (
  <section className={`pro-panel${flush ? ' pro-panel--flush' : ''} ${className}`}>
    <div className="pro-panel__head">
      <div className="pro-panel__title">
        {icon}
        <span>{title}</span>
      </div>
      {action}
    </div>
    {subtitle && <p className="pro-panel__sub">{subtitle}</p>}
    {children}
  </section>
);

/* ─── Stat tile ──────────────────────────────────────────────────────── */

interface ProStatProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'accent' | 'alt' | 'hot';
}

export const ProStat: React.FC<ProStatProps> = ({ label, value, icon, tone = 'accent' }) => (
  <div className="pro-stat">
    <div className={`pro-stat__glyph${tone === 'alt' ? ' pro-stat__glyph--2' : tone === 'hot' ? ' pro-stat__glyph--hot' : ''}`}>
      {icon}
    </div>
    <div className="pro-stat__text">
      <span className="pw-eyebrow">{label}</span>
      <span className={`pro-stat__value${tone === 'accent' ? ' pro-stat__value--accent' : ''}`}>{value}</span>
    </div>
  </div>
);

/* ─── Switch ─────────────────────────────────────────────────────────── */

interface ProSwitchProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

export const ProSwitch: React.FC<ProSwitchProps> = ({ on, onChange, label }) => (
  <button
    type="button"
    className="pw-switch"
    data-on={on}
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
  >
    <i />
  </button>
);

/* ─── Slider field ───────────────────────────────────────────────────── */

interface ProSliderProps {
  label: string;
  /** Rendered on the right of the label row. */
  readout: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Tick captions under the track. */
  scale?: string[];
}

export const ProSlider: React.FC<ProSliderProps> = ({
  label,
  readout,
  value,
  min,
  max,
  step = 1,
  onChange,
  scale
}) => (
  <div className="pw-field">
    <div className="pw-field__top">
      <span className="pw-label">{label}</span>
      {readout}
    </div>
    <input
      className="pw-slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={label}
    />
    {scale && (
      <div className="pw-scale">
        {scale.map((tick) => <span key={tick}>{tick}</span>)}
      </div>
    )}
  </div>
);

/* ─── Telemetry strip ────────────────────────────────────────────────── */

export const ProTelemetry: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="pro-telemetry">
    <div>{children}</div>
    {right ? <div>{right}</div> : null}
  </div>
);

/* ─── Scrub track ────────────────────────────────────────────────────── */

interface ProTrackProps {
  /** Selection start, 0–100. */
  from: number;
  /** Selection end, 0–100. */
  to: number;
  /** Playhead position, 0–100. Omit to hide. */
  head?: number;
  hot?: boolean;
  slim?: boolean;
  children?: React.ReactNode;
}

export const ProTrack: React.FC<ProTrackProps> = ({ from, to, head, hot, slim, children }) => (
  <div className={`pro-track${slim ? ' pro-track--slim' : ''}`}>
    <div className="pro-track__rail" />
    <div
      className="pro-track__sel"
      style={{
        left: `${Math.min(from, to)}%`,
        width: `${Math.max(0, Math.abs(to - from))}%`,
        background: hot
          ? 'linear-gradient(90deg, var(--tool-accent), var(--tool-accent-hot))'
          : undefined
      }}
    />
    {head !== undefined && <div className="pro-track__head" style={{ left: `${head}%` }} />}
    {children}
  </div>
);
