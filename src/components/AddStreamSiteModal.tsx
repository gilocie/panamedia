import { useState, useMemo } from 'react';
import {
  Globe, Film, Tv, PlaySquare, Music, Sparkles, Flame, Heart, Star, Video,
  Slash, Palette, Lock, Unlock, ShieldCheck, KeyRound, Eye, EyeOff
} from 'lucide-react';
import { hashPin } from './panamedia/utils/pinSecurity';

export interface NewStreamSiteData {
  name: string;
  url: string;
  showIcon: boolean;
  iconType: 'favicon' | 'preset';
  customIcon: string;
  favicon?: string;
  color?: string;
  isLocked?: boolean;
  lockType?: 'archive' | 'custom';
  customPin?: string;
}

export interface AddStreamSiteModalProps {
  onClose: () => void;
  onAddSite: (data: NewStreamSiteData) => void;
  initialData?: NewStreamSiteData | null;
  onEditSite?: (data: NewStreamSiteData) => void;
}

const PRESET_ICONS = [
  { id: 'globe', label: 'Web', Icon: Globe, color: '#6366f1' },
  { id: 'film', label: 'Cinema', Icon: Film, color: '#a855f7' },
  { id: 'tv', label: 'TV', Icon: Tv, color: '#3b82f6' },
  { id: 'play', label: 'Stream', Icon: PlaySquare, color: '#fbbf24' },
  { id: 'video', label: 'Clips', Icon: Video, color: '#06b6d4' },
  { id: 'music', label: 'Music', Icon: Music, color: '#ec4899' },
  { id: 'flame', label: 'Hot', Icon: Flame, color: '#ef4444' },
  { id: 'sparkles', label: 'Special', Icon: Sparkles, color: '#f59e0b' },
  { id: 'heart', label: 'Fav', Icon: Heart, color: '#f43f5e' },
  { id: 'star', label: 'Star', Icon: Star, color: '#eab308' },
];

export function AddStreamSiteModal({ onClose, onAddSite, initialData, onEditSite }: AddStreamSiteModalProps) {
  const isEditing = !!initialData;
  const [newSiteUrl, setNewSiteUrl] = useState<string>(initialData?.url || '');
  const [newSiteName, setNewSiteName] = useState<string>(initialData?.name || '');
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState<boolean>(!!initialData?.name);
  // When true: use original site icon / favicon
  // When false: custom icon picker appears on the right side
  const [useOriginalIcon, setUseOriginalIcon] = useState<boolean>(initialData ? initialData.iconType === 'favicon' : true);
  const [selectedPreset, setSelectedPreset] = useState<string>(initialData?.customIcon || 'globe');
  const [customTextOnly, setCustomTextOnly] = useState<boolean>(initialData ? initialData.showIcon === false : false);
  const [faviconError, setFaviconError] = useState<boolean>(false);

  // Security Lock feature
  const [isLocked, setIsLocked] = useState<boolean>(initialData?.isLocked ?? false);
  const [lockType, setLockType] = useState<'archive' | 'custom'>(initialData?.lockType || 'archive');
  const [customPin, setCustomPin] = useState<string>(initialData?.customPin || '');
  const [showCustomPin, setShowCustomPin] = useState<boolean>(false);

  // Derive domain and favicon URL
  const { domain, faviconUrl } = useMemo(() => {
    let raw = newSiteUrl.trim();
    if (!raw) return { domain: '', faviconUrl: '' };
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try {
      const u = new URL(raw);
      const d = u.hostname.replace(/^www\./, '');
      if (d && d.includes('.')) {
        return {
          domain: d,
          faviconUrl: `https://www.google.com/s2/favicons?domain=${d}&sz=64`
        };
      }
    } catch {}
    return { domain: '', faviconUrl: '' };
  }, [newSiteUrl]);

  // If user enters URL and site name has not been manually edited, auto-suggest name ONLY when a real domain exists
  const handleUrlChange = (val: string) => {
    setNewSiteUrl(val);
    setFaviconError(false);
    if (!isNameManuallyEdited) {
      try {
        let raw = val.trim();
        if (!raw) {
          setNewSiteName('');
          return;
        }
        if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
        const u = new URL(raw);
        const host = u.hostname.replace(/^www\./, '');
        const hostParts = host.split('.');
        // ONLY suggest name when there is a real domain and TLD (e.g., x.com, youtube.com)
        // Never trigger on partial protocol typing like "h" or "ht"
        if (
          hostParts.length >= 2 &&
          hostParts[0].length >= 1 &&
          hostParts[1].length >= 2 &&
          !['h', 'ht', 'http', 'https'].includes(hostParts[0].toLowerCase())
        ) {
          const suggested = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
          setNewSiteName(suggested);
        }
      } catch {}
    }
  };

  const handleUrlBlur = () => {
    if (!newSiteName.trim() && newSiteUrl.trim()) {
      try {
        let raw = newSiteUrl.trim();
        if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
        const u = new URL(raw);
        const host = u.hostname.replace(/^www\./, '');
        const hostParts = host.split('.');
        if (hostParts[0] && !['h', 'ht', 'http', 'https'].includes(hostParts[0].toLowerCase())) {
          setNewSiteName(hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1));
        }
      } catch {}
    }
  };

  const handleAdd = async () => {
    const rawUrl = newSiteUrl.trim();
    if (!rawUrl) {
      return;
    }
    let formattedUrl = rawUrl;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    let finalName = newSiteName.trim();
    if (!finalName) {
      try {
        const u = new URL(formattedUrl);
        const hostParts = u.hostname.replace(/^www\./, '').split('.');
        if (hostParts[0]) {
          finalName = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
        }
      } catch {}
    }
    if (!finalName) finalName = 'Stream Site';

    if (isLocked && lockType === 'custom' && !customPin.trim()) {
      alert('Please enter a custom PIN / Password, or select "Use Archive PIN".');
      return;
    }

    let finalCustomPinHashed: string | undefined = undefined;
    if (isLocked && lockType === 'custom' && customPin.trim()) {
      try {
        finalCustomPinHashed = await hashPin(customPin.trim());
      } catch {
        finalCustomPinHashed = customPin.trim();
      }
    }

    const selectedPresetObj = PRESET_ICONS.find(p => p.id === selectedPreset);

    const baseData = {
      name: finalName,
      url: formattedUrl,
      isLocked,
      lockType: isLocked ? lockType : undefined,
      customPin: finalCustomPinHashed
    };

    const submitCallback = (isEditing && onEditSite) ? onEditSite : onAddSite;

    if (useOriginalIcon) {
      // Use original website icon
      submitCallback({
        ...baseData,
        showIcon: true,
        iconType: 'favicon',
        customIcon: 'globe',
        favicon: faviconUrl && !faviconError ? faviconUrl : (initialData?.favicon || undefined),
        color: '#6366f1'
      });
    } else {
      // User toggled off original icon: use custom chosen icon or text only
      submitCallback({
        ...baseData,
        showIcon: !customTextOnly,
        iconType: 'preset',
        customIcon: selectedPreset,
        color: selectedPresetObj?.color || '#6366f1'
      });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="glass-panel modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '680px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 24px',
          borderRadius: '16px',
          background: 'rgba(14, 14, 24, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 30px rgba(99, 102, 241, 0.2)',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a5b4fc' }}>
              <Globe size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15.5px', fontWeight: 700, color: '#fff', margin: 0 }}>
                {isEditing ? 'Edit Streaming Site' : 'Add Streaming Site'}
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                {isEditing ? 'Modify website URL, tab title, icon or security PIN' : 'Add any website tab to browse & stream in Panamedia'}
              </p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              transition: 'all 0.15s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
          {/* Inputs Side-by-Side: URL and Site Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Site URL
              </label>
              <input
                type="text"
                placeholder="e.g. https://www.linkedin.com or vimeo.com"
                value={newSiteUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={handleUrlBlur}
                className="text-input"
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#fff',
                  fontSize: '12px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Site Name
              </label>
              <input
                type="text"
                placeholder="e.g. LinkedIn or Vimeo"
                value={newSiteName}
                onChange={(e) => {
                  setNewSiteName(e.target.value);
                  setIsNameManuallyEdited(true);
                }}
                className="text-input"
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#fff',
                  fontSize: '12px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Lower Section: 2 Columns (Left: Original Icon Toggle & Preview, Right: Custom Icon Picker) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            
            {/* Left Column: Toggle & Tab Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Original Icon Toggle Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Use Original Site Icon</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {useOriginalIcon ? 'Showing website favicon' : 'Toggled off — custom icon active'}
                    </span>
                  </div>
                  <label
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      width: '38px',
                      height: '22px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useOriginalIcon}
                      onChange={(e) => setUseOriginalIcon(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: useOriginalIcon ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : 'rgba(255,255,255,0.15)',
                        borderRadius: '20px',
                        transition: '0.2s',
                        boxShadow: useOriginalIcon ? '0 0 8px rgba(99, 102, 241, 0.5)' : 'none'
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          content: '""',
                          height: '16px',
                          width: '16px',
                          left: useOriginalIcon ? '19px' : '3px',
                          bottom: '3px',
                          backgroundColor: '#fff',
                          borderRadius: '50%',
                          transition: '0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                        }}
                      />
                    </span>
                  </label>
                </div>

                {/* Status info based on toggle */}
                {useOriginalIcon ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.25)'
                  }}>
                    {faviconUrl && !faviconError ? (
                      <img
                        src={faviconUrl}
                        alt="favicon"
                        style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'contain' }}
                        onError={() => setFaviconError(true)}
                      />
                    ) : (
                      <Globe size={20} style={{ color: '#6366f1' }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>Website Favicon Active</span>
                      <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                        {domain ? `Resolved from ${domain}` : 'Enter URL above to preview favicon'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.25)'
                  }}>
                    <Palette size={16} style={{ color: '#c084fc', flexShrink: 0 }} />
                    <span style={{ fontSize: '10.5px', color: '#e9d5ff' }}>
                      Pick an icon on the right, or choose Text Only.
                    </span>
                  </div>
                )}
              </div>

              {/* Live Tab Preview Card */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                  Tab Preview:
                </span>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid var(--primary)',
                  color: '#fff',
                  fontSize: '11.5px',
                  fontWeight: 500
                }}>
                  {useOriginalIcon ? (
                    faviconUrl && !faviconError ? (
                      <img src={faviconUrl} alt="" style={{ width: '13px', height: '13px', borderRadius: '2px', objectFit: 'contain' }} />
                    ) : (
                      <Globe size={12} style={{ color: 'var(--primary)' }} />
                    )
                  ) : !customTextOnly ? (() => {
                    const p = PRESET_ICONS.find(item => item.id === selectedPreset) || PRESET_ICONS[0];
                    const IconComp = p.Icon;
                    return <IconComp size={12} style={{ color: p.color }} />;
                  })() : null}
                  <span>{newSiteName.trim() || 'Site Name'}</span>
                  {isLocked && <Lock size={11} style={{ color: '#eab308', marginLeft: '2px', flexShrink: 0 }} />}
                </div>
              </div>
            </div>

            {/* Right Column: Custom Icon Picker */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '160px'
            }}>
              {!useOriginalIcon ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Palette size={13} /> Pick Custom Icon:
                    </span>
                    {/* Text Only Option */}
                    <button
                      type="button"
                      onClick={() => setCustomTextOnly(!customTextOnly)}
                      style={{
                        background: customTextOnly ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid ' + (customTextOnly ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'),
                        color: customTextOnly ? '#fca5a5' : 'var(--text-muted)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Slash size={10} /> Text Only
                    </button>
                  </div>

                  {!customTextOnly ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                      {PRESET_ICONS.map(preset => {
                        const IconComp = preset.Icon;
                        const isSelected = selectedPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setSelectedPreset(preset.id);
                              setCustomTextOnly(false);
                            }}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              padding: '7px 4px',
                              borderRadius: '8px',
                              background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                              border: isSelected ? `1px solid ${preset.color}` : '1px solid rgba(255, 255, 255, 0.06)',
                              cursor: 'pointer',
                              color: isSelected ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s'
                            }}
                            title={preset.label}
                          >
                            <IconComp size={15} style={{ color: isSelected ? preset.color : 'rgba(255,255,255,0.7)' }} />
                            <span style={{ fontSize: '9px', fontWeight: isSelected ? 600 : 400 }}>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px 12px',
                      textAlign: 'center',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      border: '1px dashed rgba(255,255,255,0.08)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        No icon will be displayed on the tab header. Only text will appear.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* When Original Icon is ON, show an invitation card to customize */
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '14px 10px',
                  textAlign: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.3)'
                  }}>
                    <Palette size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                      Original Site Favicon Active
                    </span>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', maxWidth: '230px' }}>
                      Want a custom icon or text only? Turn off the toggle to customize.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseOriginalIcon(false)}
                    style={{
                      marginTop: '2px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#a5b4fc',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                  >
                    Switch to Custom Icon
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Privacy & Security Lock Section */}
          <div style={{
            background: isLocked ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)' : 'rgba(255, 255, 255, 0.02)',
            border: isLocked ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transition: 'all 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: isLocked ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isLocked ? '#eab308' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.2s'
                }}>
                  {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Lock Tab Behind Password / PIN</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {isLocked ? 'Require PIN verification whenever user clicks this tab' : 'Tab is public and open to browse freely'}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => setIsLocked(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: isLocked ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)' : 'rgba(255,255,255,0.15)',
                  borderRadius: '20px',
                  transition: '0.2s',
                  boxShadow: isLocked ? '0 0 10px rgba(234, 179, 8, 0.4)' : 'none'
                }}>
                  <span style={{
                    position: 'absolute',
                    height: '16px',
                    width: '16px',
                    left: isLocked ? '19px' : '3px',
                    bottom: '3px',
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                  }} />
                </span>
              </label>
            </div>

            {isLocked && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                {/* Radio choices */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setLockType('archive')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: lockType === 'archive' ? '1.5px solid #eab308' : '1px solid rgba(255,255,255,0.08)',
                      background: lockType === 'archive' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255,255,255,0.02)',
                      color: lockType === 'archive' ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      textAlign: 'left'
                    }}
                  >
                    <ShieldCheck size={16} style={{ color: lockType === 'archive' ? '#eab308' : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600 }}>Use Archive PIN</div>
                      <div style={{ fontSize: '9px', opacity: 0.7 }}>Same as your Master Archive</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLockType('custom')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: lockType === 'custom' ? '1.5px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                      background: lockType === 'custom' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                      color: lockType === 'custom' ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      textAlign: 'left'
                    }}
                  >
                    <KeyRound size={16} style={{ color: lockType === 'custom' ? '#a5b4fc' : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600 }}>Set Custom PIN</div>
                      <div style={{ fontSize: '9px', opacity: 0.7 }}>Special PIN for this tab</div>
                    </div>
                  </button>
                </div>

                {/* Custom PIN input */}
                {lockType === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Tab Password or PIN
                    </label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0 10px'
                    }}>
                      <input
                        type={showCustomPin ? 'text' : 'password'}
                        placeholder="e.g. 1234 or mySecretPin"
                        value={customPin}
                        onChange={(e) => setCustomPin(e.target.value)}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#fff',
                          fontSize: '12px',
                          padding: '8px 0'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustomPin(!showCustomPin)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: showCustomPin ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        {showCustomPin ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons: Anchored inside dialog footer */}
        <div style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0
        }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAdd}
            style={{
              padding: '7px 20px',
              borderRadius: '8px',
              fontSize: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              fontWeight: 600
            }}
          >
            {isEditing ? 'Save Changes' : 'Add Site'}
          </button>
        </div>
      </div>
    </div>
  );
}
