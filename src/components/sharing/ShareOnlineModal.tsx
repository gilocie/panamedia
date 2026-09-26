import { useState } from 'react';
import {
  Globe, Key, Clock, Shield, DollarSign, Tag,
  X, Eye, Download, Copy, CheckCircle2,
  AlertTriangle, Info
} from 'lucide-react';

export interface ShareSettings {
  profileName: string;
  accessKey: string;
  expiresIn: string;
  contentAccess: 'view_only' | 'full_access';
  pricingModel: 'free' | 'per_item' | 'package';
  currency: string;
  price: string;
  category: 'videos' | 'audios' | 'software' | 'books' | 'files';
}

interface ShareOnlineModalProps {
  folder: string;
  onClose: () => void;
  onConfirm: (settings: ShareSettings) => void;
}

function generateAccessKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export function ShareOnlineModal({ folder, onClose }: ShareOnlineModalProps) {
  const [settings, setSettings] = useState<ShareSettings>({
    profileName: '',
    accessKey: generateAccessKey(),
    expiresIn: '24h',
    contentAccess: 'view_only',
    pricingModel: 'free',
    currency: 'USD',
    price: '0',
    category: 'files',
  });

  const [keyCopied, setKeyCopied] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const copyAccessKey = () => {
    navigator.clipboard.writeText(settings.accessKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const regenerateKey = () => {
    setSettings(prev => ({ ...prev, accessKey: generateAccessKey() }));
  };

  const handleConfirm = () => {
    setShowComingSoon(true);
  };

  const folderName = folder.split(/[\\/]/).pop() || folder;

  if (showComingSoon) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <div style={{
          background: '#15151f', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px', padding: '40px', maxWidth: '420px', width: '90%',
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            border: '2px solid rgba(99,102,241,0.3)'
          }}>
            <Globe size={28} style={{ color: 'var(--primary)' }} />
          </div>

          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
            🚧 Feature In Development
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '6px' }}>
            Online folder sharing is currently under active development.
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, marginBottom: '24px' }}>
            Once completed, you'll be notified and your settings will be applied automatically.
            Your access key <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{settings.accessKey}</strong> has been reserved.
          </div>

          <div style={{
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: '10px', padding: '12px', marginBottom: '24px',
            display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left'
          }}>
            <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Use the <strong style={{ color: '#fff' }}>Check for Updates</strong> button in the app header to see when this feature becomes available.
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '12px 32px', background: 'var(--primary)',
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
            }}
          >
            Got it, Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: '#12121a', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px', maxWidth: '520px', width: '95%',
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Globe size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>Share Folder Online</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                📁 {folderName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Profile Name */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Profile Name
            </label>
            <input
              type="text"
              placeholder="Enter your display name..."
              value={settings.profileName}
              onChange={e => setSettings(prev => ({ ...prev, profileName: e.target.value }))}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontSize: '12px', outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Access Key */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Key size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Access Key
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                color: 'var(--primary)', fontSize: '16px', fontWeight: '700',
                fontFamily: 'monospace', letterSpacing: '3px', textAlign: 'center'
              }}>
                {settings.accessKey}
              </div>
              <button
                onClick={copyAccessKey}
                style={{
                  padding: '10px 12px', borderRadius: '8px',
                  background: keyCopied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${keyCopied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: keyCopied ? '#4ade80' : '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
                title="Copy Key"
              >
                {keyCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              </button>
              <button
                onClick={regenerateKey}
                style={{
                  padding: '10px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: '600'
                }}
                title="Generate New Key"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Expiry + Category Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Clock size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Auto-Expire
              </label>
              <select
                value={settings.expiresIn}
                onChange={e => setSettings(prev => ({ ...prev, expiresIn: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: '12px', appearance: 'none'
                }}
              >
                <option value="1h">1 Hour</option>
                <option value="6h">6 Hours</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
                <option value="never">Never (until I turn off)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Tag size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Folder Category
              </label>
              <select
                value={settings.category}
                onChange={e => setSettings(prev => ({ ...prev, category: e.target.value as ShareSettings['category'] }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: '12px', appearance: 'none'
                }}
              >
                <option value="videos">📹 Videos</option>
                <option value="audios">🎵 Audio / Music</option>
                <option value="software">💻 Software</option>
                <option value="books">📚 Books / Documents</option>
                <option value="files">📁 General Files</option>
              </select>
            </div>
          </div>

          {/* Content Access */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Shield size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Content Access Level
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { value: 'view_only' as const, icon: <Eye size={14} />, label: 'View Only', desc: 'Watch/listen without download' },
                { value: 'full_access' as const, icon: <Download size={14} />, label: 'Full Access', desc: 'Stream and download files' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSettings(prev => ({ ...prev, contentAccess: opt.value }))}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: `1px solid ${settings.contentAccess === opt.value ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
                    background: settings.contentAccess === opt.value ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                    color: '#fff', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: settings.contentAccess === opt.value ? 'var(--primary)' : 'var(--text-muted)' }}>{opt.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: '600' }}>{opt.label}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Model */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <DollarSign size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Pricing Model
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              {[
                { value: 'free' as const, label: '🆓 Free' },
                { value: 'per_item' as const, label: '💰 Per Item' },
                { value: 'package' as const, label: '📦 Package' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSettings(prev => ({ ...prev, pricingModel: opt.value }))}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: `1px solid ${settings.pricingModel === opt.value ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
                    background: settings.pricingModel === opt.value ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                    color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: '600',
                    transition: 'all 0.15s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {settings.pricingModel !== 'free' && (
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px' }}>
                <select
                  value={settings.currency}
                  onChange={e => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                  style={{
                    padding: '8px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '11px', appearance: 'none'
                  }}
                >
                  <option value="USD">🇺🇸 USD</option>
                  <option value="EUR">🇪🇺 EUR</option>
                  <option value="GBP">🇬🇧 GBP</option>
                  <option value="ZAR">🇿🇦 ZAR</option>
                  <option value="NGN">🇳🇬 NGN</option>
                  <option value="KES">🇰🇪 KES</option>
                  <option value="BRL">🇧🇷 BRL</option>
                  <option value="INR">🇮🇳 INR</option>
                  <option value="JPY">🇯🇵 JPY</option>
                </select>
                <input
                  type="number"
                  placeholder={settings.pricingModel === 'per_item' ? 'Price per file...' : 'Package price...'}
                  value={settings.price}
                  onChange={e => setSettings(prev => ({ ...prev, price: e.target.value }))}
                  style={{
                    padding: '8px 12px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '12px', outline: 'none'
                  }}
                />
              </div>
            )}
            {settings.pricingModel === 'package' && (
              <div style={{
                marginTop: '8px', padding: '8px 10px', borderRadius: '6px',
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <AlertTriangle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  Package: user pays once and gets full access with your key.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '10px', flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', color: '#fff', fontSize: '12px',
              fontWeight: '600', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!settings.profileName.trim()}
            style={{
              flex: 1, padding: '12px',
              background: !settings.profileName.trim()
                ? 'rgba(99,102,241,0.3)'
                : 'linear-gradient(135deg, #6366f1, #a855f7)',
              border: 'none', borderRadius: '10px', color: '#fff',
              fontSize: '12px', fontWeight: '700', cursor: settings.profileName.trim() ? 'pointer' : 'default',
              opacity: settings.profileName.trim() ? 1 : 0.5,
              boxShadow: settings.profileName.trim() ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <Globe size={14} /> Confirm & Share
          </button>
        </div>
      </div>
    </div>
  );
}
