import { Film, Flame, Globe, Heart, Music, PlaySquare, Sparkles, Star, Tv, Video } from 'lucide-react';

export const DEFAULT_STREAM_SITES = [
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000' },
  { name: 'Moviebox', url: 'https://moviebox.ph/', color: '#fbbf24' },
  { name: 'TikTok', url: 'https://www.tiktok.com', color: '#010101' }
];

export function cleanStreamUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return rawUrl;
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = urlObj.hostname.toLowerCase();

    if (host.includes('chaturbate.com')) {
      const room = urlObj.searchParams.get('room');
      if (room && (urlObj.pathname.includes('livecampreview') || urlObj.pathname.includes('/in/') || urlObj.searchParams.has('campaign'))) {
        return `https://chaturbate.com/${encodeURIComponent(room)}/`;
      }
    }
    if (host.includes('stripchat.com')) {
      const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
      if (model && (urlObj.pathname.includes('/promo') || urlObj.pathname.includes('/embed') || urlObj.searchParams.has('campaign'))) {
        return `https://stripchat.com/${encodeURIComponent(model)}/`;
      }
    }
    if (host.includes('camsoda.com')) {
      const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
      if (model) return `https://www.camsoda.com/${encodeURIComponent(model)}`;
    }
    if (host.includes('bongacams.com')) {
      const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
      if (model) return `https://bongacams.com/${encodeURIComponent(model)}/`;
    }
  } catch (e) {}
  return rawUrl;
}

export function getSiteIcon(site: any) {
  if (site.showIcon === false) return null;

  if (site.favicon) {
    return (
      <img
        src={site.favicon}
        alt=""
        style={{ width: '13px', height: '13px', borderRadius: '2px', objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
      />
    );
  }

  if (site.customIcon) {
    switch (site.customIcon) {
      case 'film': return <Film size={12} style={{ color: site.color || '#a855f7', flexShrink: 0 }} />;
      case 'tv': return <Tv size={12} style={{ color: site.color || '#3b82f6', flexShrink: 0 }} />;
      case 'play': return <PlaySquare size={12} style={{ color: site.color || '#fbbf24', flexShrink: 0 }} />;
      case 'video': return <Video size={12} style={{ color: site.color || '#06b6d4', flexShrink: 0 }} />;
      case 'music': return <Music size={12} style={{ color: site.color || '#ec4899', flexShrink: 0 }} />;
      case 'flame': return <Flame size={12} style={{ color: site.color || '#ef4444', flexShrink: 0 }} />;
      case 'sparkles': return <Sparkles size={12} style={{ color: site.color || '#f59e0b', flexShrink: 0 }} />;
      case 'heart': return <Heart size={12} style={{ color: site.color || '#f43f5e', flexShrink: 0 }} />;
      case 'star': return <Star size={12} style={{ color: site.color || '#eab308', flexShrink: 0 }} />;
      default: return <Globe size={12} style={{ color: site.color || 'var(--primary)', flexShrink: 0 }} />;
    }
  }

  const name = (site.name || '').toLowerCase();
  if (name.includes('youtube')) {
    return (
      <svg viewBox="0 0 24 24" width="12" height="12" fill={site.color || '#ff0000'} style={{ flexShrink: 0 }}>
        <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  if (name.includes('tiktok')) {
    return (
      <svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" style={{ flexShrink: 0, background: '#000', borderRadius: '2px', padding: '1px' }}>
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.97v7.57c0 2.21-.73 4.41-2.22 6.02-1.89 2.05-4.78 2.87-7.46 2.2-2.74-.68-4.99-2.79-5.74-5.52-.89-3.21.36-6.84 3.08-8.62 1.62-1.07 3.63-1.46 5.53-1.09v4.08c-1.2-.38-2.58-.2-3.62.53-1.12.78-1.68 2.21-1.39 3.56.27 1.31 1.41 2.37 2.74 2.53 1.75.21 3.51-.83 3.96-2.53.1-.38.13-.77.13-1.16V0z" />
      </svg>
    );
  }
  return <Globe size={12} style={{ color: site.color || 'var(--primary)', flexShrink: 0 }} />;
}
