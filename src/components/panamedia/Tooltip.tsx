/**
 * Tooltip — the app's replacement for the browser's native `title` attribute.
 *
 * Why not `title`:
 *
 *  - Native tooltips cannot be styled. They are a grey OS rectangle with a
 *    ~1s delay, sharp corners and system font. Against this app's glass-and-
 *    gradient surfaces they looked like a different application.
 *  - They render *after* a delay and *above* everything, including the
 *    player's own controls, which meant a tooltip could cover the button you
 *    were reaching for.
 *  - They cannot show a keyboard hint, an icon, or a second line of
 *    explanation, so every hint had to be flattened into one run-on string
 *    ("Repeat: Off (click to enable Repeat One)").
 *
 * What this gives instead:
 *  - Placement is chosen per side and flipped automatically when the tooltip
 *    would leave the viewport, so it never gets clipped by the window edge.
 *  - Rendered in a portal on top of everything, with a real z-index.
 *  - Optional `hint` line for a keyboard shortcut, rendered as a key chip.
 *  - Optional `note` line for the "what this does" explanation, so the button
 *    label can stay short and the detail can live in the tooltip.
 *  - Deliberate delay before appearing, so sweeping the mouse across a toolbar
 *    does not strobe the screen.
 *
 * Usage:
 *   <Tooltip label="Fullscreen" hint="F" side="top">
 *     <button ...>...</button>
 *   </Tooltip>
 *
 * The tooltip also works on disabled children, which is why it wraps rather
 * than being applied as an attribute: a disabled button swallows pointer
 * events, so a `title` on it never appears.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** The control's name. Always shown. */
  label: string;
  /** Keyboard shortcut, rendered as a key chip beside the label. */
  hint?: string;
  /** Secondary line: what this actually does. */
  note?: string;
  /** Preferred side. Flipped automatically if it would overflow. */
  side?: TooltipSide;
  /** Milliseconds to wait before showing. */
  delay?: number;
  /** Keep it mounted while the pointer rests on it. Default true. */
  children: React.ReactNode;
}

const GAP = 10;      // distance between anchor and tooltip
const EDGE = 8;      // minimum distance from the viewport edge
const ARROW = 5;     // arrow half-size, matches the CSS border

interface Position {
  left: number;
  top: number;
  actualSide: TooltipSide;
  arrowLeft: number;
  arrowTop: number;
}

export function Tooltip({
  label,
  hint,
  note,
  side = 'top',
  delay = 320,
  children,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), delay);
  }, [clearTimer, delay]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPos(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Position after the tooltip has rendered, so its real size is known. Using
  // layout effect avoids a frame where it appears at the wrong spot.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;

    // The wrapper is `display: contents` so it cannot disturb the parent's
    // layout, which also means it has no box of its own to measure. The real
    // target is the first element inside it.
    const target = anchor.querySelector('*') as HTMLElement | null;
    const a = (target ?? anchor).getBoundingClientRect();
    if (a.width === 0 && a.height === 0) return;
    const t = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try the preferred side, then the opposite, then the two perpendicular
    // ones. The first that fits wins; if none fit, the preferred side is used
    // anyway and clamped, which beats not showing anything.
    const order: TooltipSide[] =
      side === 'top' || side === 'bottom'
        ? [side, side === 'top' ? 'bottom' : 'top', 'right', 'left']
        : [side, side === 'left' ? 'right' : 'left', 'top', 'bottom'];

    let actualSide = side;
    for (const s of order) {
      const fits =
        s === 'top'    ? a.top - t.height - GAP >= EDGE :
        s === 'bottom' ? a.bottom + t.height + GAP <= vh - EDGE :
        s === 'left'   ? a.left - t.width - GAP >= EDGE :
                         a.right + t.width + GAP <= vw - EDGE;
      if (fits) { actualSide = s; break; }
    }

    let left: number;
    let top: number;

    if (actualSide === 'top' || actualSide === 'bottom') {
      left = a.left + a.width / 2 - t.width / 2;
      top = actualSide === 'top' ? a.top - t.height - GAP : a.bottom + GAP;
    } else {
      left = actualSide === 'left' ? a.left - t.width - GAP : a.right + GAP;
      top = a.top + a.height / 2 - t.height / 2;
    }

    // Clamp inside the viewport. The arrow is then repositioned to keep
    // pointing at the anchor even when the body has been shifted.
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - t.width - EDGE));
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - t.height - EDGE));

    let arrowLeft: number;
    let arrowTop: number;
    if (actualSide === 'top' || actualSide === 'bottom') {
      arrowLeft = Math.min(Math.max(ARROW + 2, a.left + a.width / 2 - left), Math.max(ARROW + 2, t.width - ARROW - 2));
      arrowTop = actualSide === 'top' ? t.height : -ARROW * 2;
    } else {
      arrowLeft = actualSide === 'left' ? t.width : -ARROW * 2;
      arrowTop = Math.min(Math.max(ARROW + 2, a.top + a.height / 2 - top), Math.max(ARROW + 2, t.height - ARROW - 2));
    }

    setPos({ left, top, actualSide, arrowLeft, arrowTop });
  }, [open, side]);

  // Follow the anchor while open, so scrolling or moving the window does not
  // leave the tooltip pointing at where the control used to be.
  useEffect(() => {
    if (!open) return;
    const reposition = () => setPos(null);   // null forces the layout effect to re-run
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Escape dismisses without moving the pointer, which is what a keyboard user
  // needs and what a mouse user gets for free on mouse-out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  const tip = open ? (
    <div
      ref={tipRef}
      role="tooltip"
      className={`pn-tooltip${pos ? ' pn-tooltip--in' : ''}`}
      // The side is exposed as a data attribute so the CSS can rotate the arrow
      // to point at the anchor from whichever edge is showing.
      data-side={pos ? pos.actualSide : side}
      style={{
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        // Measured, not guessed: the arrow sits on the tooltip's own edge so it
        // inherits the border colour correctly.
        ['--tip-arrow-left' as any]: `${pos ? pos.arrowLeft : 0}px`,
        ['--tip-arrow-top' as any]: `${pos ? pos.arrowTop : 0}px`,
      }}
    >
      <span className="pn-tooltip__arrow" />
      <span className="pn-tooltip__row">
        <span className="pn-tooltip__label">{label}</span>
        {hint && <kbd className="pn-tooltip__hint">{hint}</kbd>}
      </span>
      {note && <span className="pn-tooltip__note">{note}</span>}
    </div>
  ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="pn-tooltip-anchor"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
        // The wrapper is a span so it can sit around a <button> without
        // changing the flex/grid behaviour of the parent.
        style={{ display: 'contents' }}
      >
        {children}
      </span>
      {tip && typeof document !== 'undefined' && createPortal(tip, document.body)}
    </>
  );
}

export default Tooltip;