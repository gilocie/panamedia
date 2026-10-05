import { HelpCircle, Info, Tv, Send } from 'lucide-react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

interface HelpTabProps {
  helpSubTab: 'guide' | 'license';
  setHelpSubTab: (v: 'guide' | 'license') => void;
}

export function HelpTab({ helpSubTab, setHelpSubTab }: HelpTabProps) {
  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="main-header" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div className="main-title-container">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={20} style={{ color: 'var(--primary)' }} /> Help &amp; Documentation Center
          </h1>
          <p>Get help using Panamedia Player &amp; Downloader, view licenses, or contact support.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setHelpSubTab('guide')}
            className={`btn-secondary ${helpSubTab === 'guide' ? 'active' : ''}`}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
              background: helpSubTab === 'guide' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              borderColor: helpSubTab === 'guide' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
            }}
          >
            Usage Guide
          </button>
          <button
            onClick={() => setHelpSubTab('license')}
            className={`btn-secondary ${helpSubTab === 'license' ? 'active' : ''}`}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
              background: helpSubTab === 'license' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              borderColor: helpSubTab === 'license' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
            }}
          >
            License Agreement
          </button>
        </div>
      </div>

      {helpSubTab === 'guide' ? (
        <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden', padding: '4px' }}>
          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '6px' }}>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>The Problem It Solves</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)' }}>
                Historically, media workflows were fractured. Users had to download streams using clunky browser extensions, find where the file saved on disk, and then open it with separate player software. Additionally, legacy player tools often lacked H.265/HEVC decoding runtimes, visualizers, or robust equalizers.
              </p>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)', marginTop: '10px' }}>
                <strong>Panamedia</strong> bridges this gap by unifying a multi-threaded background downloader, an automatic local folder synchronizer, and a full-featured, hardware-accelerated media player into a single workspace.
              </p>
            </div>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>How to use the player</h3>
              <ul style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', paddingLeft: '0px', listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Direct Playback:', desc: 'Double-click any finished task in the Downloads tab, or drag and drop any local file directly into the player screen.' },
                  { label: 'Syncing Folders:', desc: 'Configure download folders in Settings, then click the sync icon in the player sidebar to populate your music/video libraries instantly.' },
                  { label: 'USB Sendtray:', desc: 'Plug in a USB flash drive, press S over a playing file or click Sendtray in player sidebar, to copy media files to your drive instantly.' },
                  { label: 'Audio EQ pipeline:', desc: 'Toggle the 5-band equalizer tab (Bass, Mid-Bass, Mid, Mid-Treble, Treble) with presets (Bass Boost, Vocal, Flat) to adjust sound filters in real-time.' },
                ].map(({ label, desc }) => (
                  <li key={label} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--primary)', fontSize: '14px', lineHeight: '1' }}>•</span>
                    <div><strong>{label}</strong> {desc}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>Developer Contact Center</h3>
              {[
                { icon: <Info size={16} />, label: 'Developed By', value: 'Gift Ilocie' },
                { icon: <Tv size={16} />, label: 'Phone Contacts', value: '+265 991 972 336 | +265 888 333 673' },
                { icon: <Send size={16} />, label: 'Support Emails', value: 'gilocie@gmail.com | gosavesite@gamil.com' },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px' }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', wordBreak: 'break-all' }}>{value}</div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => { if (electron) electron.shell.openExternal('https://wa.me/265991972336'); }}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px', background: '#25d366',
                  color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 15px rgba(37, 211, 102, 0.2)'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.99L2 22l5.23-1.371a9.936 9.936 0 004.78 1.23h.005c5.502 0 9.985-4.479 9.986-9.987-.001-2.67-1.041-5.18-2.932-7.071C17.18 3.036 14.67 2.001 12.012 2zm6.066 14.075c-.266.75-1.543 1.375-2.11 1.438-.567.062-1.112.28-3.609-.75-3.195-1.317-5.234-4.578-5.395-4.793-.16-.215-1.293-1.72-1.293-3.284 0-1.564.82-2.33 1.113-2.637.293-.307.64-.383.856-.383.215 0 .43.003.618.012.196.009.46-.075.72.568.266.643.91 2.22 1.026 2.453.117.233.096.502-.07.712-.167.21-.363.38-.53.58-.168.196-.347.41-.15.75.195.336.87 1.428 1.865 2.316.994.888 1.83 1.164 2.188 1.343.358.179.566.149.78-.098.214-.247.91-1.055 1.152-1.417.24-.362.48-.302.81-.179.33.123 2.085 1.028 2.448 1.21.363.18.604.269.67.382.067.114.067.66-.2 1.41z"/>
                </svg>
                Chat on WhatsApp (+265 991 972 336) ↗
              </button>
            </div>
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--primary)', background: 'rgba(99, 102, 241, 0.03)' }}>
              <p style={{ fontSize: '12px', lineHeight: '1.5', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                <strong>💡 Pro Tip:</strong> Double-clicking the video screen toggles Fullscreen mode. Scroll your mouse wheel over the video area to quickly change volume levels.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>End User License Agreement (EULA)</h3>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: '12px', lineHeight: '1.7', color: 'rgba(255,255,255,0.75)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', paddingRight: '10px' }}>
{`PANAMEDIA END USER LICENSE AGREEMENT (EULA)

Please read this End User License Agreement ("Agreement") carefully before installing or using Panamedia ("Software").

1. LICENSE GRANT
Gift Ilocie hereby grants you a personal, non-transferable, non-exclusive license to use the Software on your devices in accordance with the terms of this Agreement.

2. RESTRICTIONS
You are not permitted to:
- Edit, alter, modify, adapt, translate or otherwise change the whole or any part of the Software.
- Decompile, disassemble or reverse engineer the Software.
- Reproduce, copy, distribute or resell the Software for commercial purposes without prior permission.

3. COPYRIGHT & OWNERSHIP
Gift Ilocie retains ownership of the Software as originally downloaded and all subsequent downloads. The Software is protected by copyright and other intellectual property laws.

4. NO WARRANTY
The Software is provided "as is", without warranty of any kind, express or implied. In no event shall the authors or copyright holders be liable for any claim, damages or other liability.

Developed By Gift Ilocie.
Contact: Phone +265 991 972 336 | +265 888 333 673
Email: gilocie@gmail.com | gosavesite@gamil.com`}
          </div>
        </div>
      )}
    </div>
  );
}
