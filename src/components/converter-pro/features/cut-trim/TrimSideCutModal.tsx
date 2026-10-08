import React from "react";
import { Scissors } from "lucide-react";

export interface TrimSideCutModalProps {
  side: 'left' | 'right';
  onConfirm: () => void;
  onCancel: () => void;
}

export const TrimSideCutModal: React.FC<TrimSideCutModalProps> = ({
  side,
  onConfirm,
  onCancel,
}) => {
  return (
    <div
      className="pw-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(3, 5, 12, 0.76)',
        backdropFilter: 'blur(6px)'
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="side-cut-title"
        aria-describedby="side-cut-description"
        style={{
          width: 'min(420px, 100%)',
          padding: 22,
          borderRadius: 16,
          border: '1px solid rgba(248, 113, 113, 0.4)',
          background: 'linear-gradient(145deg, #171827, #0d0e17)',
          boxShadow: '0 24px 80px rgba(0,0,0,.55)',
          color: 'var(--pw-text, #f8fafc)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            color: '#f87171',
            background: 'rgba(248, 113, 113, .14)'
          }}>
            <Scissors size={18} />
          </span>
          <div>
            <h2 id="side-cut-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {side === 'left' ? 'Remove the unwanted left clip?' : 'Remove the unwanted right clip?'}
            </h2>
            <span style={{ color: 'var(--pw-text-dim, #94a3b8)', fontSize: 11 }}>
              This action changes the edit timeline.
            </span>
          </div>
        </div>
        <p id="side-cut-description" style={{ margin: '0 0 20px', color: 'var(--pw-text-dim, #b7bdcc)', fontSize: 13, lineHeight: 1.55 }}>
          {side === 'left'
            ? 'The footage before your selected range will be removed. The selected clip shifts to the timeline start, and the right-side unwanted clip stays available until you remove it.'
            : 'The footage after your selected range will be removed. Your selected clip stays in place and remains selected.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="pw-btn pw-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="pw-btn pw-btn--danger" onClick={onConfirm}>
            <Scissors size={14} /> Remove clip
          </button>
        </div>
      </section>
    </div>
  );
};
