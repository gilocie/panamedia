import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ════════════════════════════════════════════════════════════════════════
   useTimelineDrag — pointer-driven In/Out/Playhead dragging on a timeline.

   Pointer Events are used rather than mouse/touch pairs so one code path
   covers mouse, pen and touch. The drag is bound to `pointermove`/`pointerup`
   on the window rather than the handle, because a fast drag outruns the
   element's bounds and would otherwise stall.

   The handle reports a 0–1 fraction of the track width; the caller converts
   that to seconds. Keeping the maths here means every tool drags identically.
   ════════════════════════════════════════════════════════════════════════ */

export type DragTarget = 'in' | 'out' | 'playhead';

export interface UseTimelineDragArgs {
  /** Width of the interactive track in px. */
  trackRef: React.RefObject<HTMLElement | null>;
  /** Called continuously while dragging, with a 0–1 fraction. */
  onDrag: (target: DragTarget, fraction: number) => void;
  /** Called once when the pointer is released. */
  onCommit?: (target: DragTarget, fraction: number) => void;
  /** While a drag is live, suppress text selection and the preview seek. */
  onDragStateChange?: (dragging: DragTarget | null) => void;
}

export const useTimelineDrag = ({
  trackRef,
  onDrag,
  onCommit,
  onDragStateChange
}: UseTimelineDragArgs) => {
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const activeRef = useRef<DragTarget | null>(null);
  const fractionRef = useRef(0);

  // Latest callbacks without re-binding the window listeners on every render.
  const onDragRef = useRef(onDrag);
  const onCommitRef = useRef(onCommit);
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragRef.current = onDrag;
  onCommitRef.current = onCommit;
  onDragStateChangeRef.current = onDragStateChange;

  const fractionFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      // Clamp so a drag past either edge pins to 0 / 1 instead of escaping.
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    },
    [trackRef]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      const fraction = fractionFromClientX(event.clientX);
      fractionRef.current = fraction;
      if (activeRef.current) onDragRef.current(activeRef.current, fraction);
    };

    const handleUp = () => {
      const target = activeRef.current;
      if (target) onCommitRef.current?.(target, fractionRef.current);
      activeRef.current = null;
      setDragging(null);
    };

    // `move` on the window keeps the drag alive when the cursor leaves the
    // handle, which happens constantly at high pointer speeds.
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, fractionFromClientX]);

  useEffect(() => {
    onDragStateChangeRef.current?.(dragging);
  }, [dragging]);

  /**
   * Props to spread onto a handle element.
   *
   * Deliberately excludes `style`: callers position the handle with their own
   * `style={{ left }}`, and a `style` key here would silently overwrite it.
   * `touchAction` is required on the element for touch dragging to work, so it
   * is exported separately for the caller to merge in.
   */
  const handleProps = useCallback(
    (target: DragTarget, currentFraction = 0) => ({
      onPointerDown: (event: React.PointerEvent) => {
        // Primary button / single touch only.
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.preventDefault();
        event.stopPropagation();
        activeRef.current = target;
        setDragging(target);
        // Seed the value from the grab point so the handle does not jump.
        const fraction = fractionFromClientX(event.clientX);
        fractionRef.current = fraction;
        onDragRef.current(target, fraction);
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        // Arrow keys nudge; Shift makes it a coarse step. Kept alongside the
        // pointer drag so the handles stay keyboard-operable.
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;
        // Timeline values are stored as a 0–1 fraction, so keyboard steps
        // should be based on that value rather than on CSS pixels.
        const step = event.shiftKey ? 0.01 : 0.001;
        const current = currentFraction;
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const next = Math.min(1, Math.max(0, current + direction * step));
        fractionRef.current = next;
        onDragRef.current(target, next);
        onCommitRef.current?.(target, next);
      }
    }),
    [fractionFromClientX, trackRef]
  );

  return { dragging, handleProps, touchAction: 'none' as const };
};
