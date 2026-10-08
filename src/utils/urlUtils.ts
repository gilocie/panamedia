export const isExtractorUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com/') ||
    lower.includes('youtu.be/') ||
    lower.includes('facebook.com/') ||
    lower.includes('fb.watch/') ||
    lower.includes('fb.com/') ||
    lower.includes('instagram.com/') ||
    lower.includes('tiktok.com/') ||
    lower.includes('x.com/') ||
    lower.includes('twitter.com/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('dailymotion.com/') ||
    lower.includes('reddit.com/') ||
    lower.includes('threads.net/') ||
    lower.includes('pinterest.com/') ||
    lower.includes('.m3u8') ||
    lower.includes('.mpd');
};

export const isSocialOrPlatformUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('facebook.com/') ||
    lower.includes('fb.watch/') ||
    lower.includes('fb.com/') ||
    lower.includes('instagram.com/') ||
    lower.includes('tiktok.com/') ||
    lower.includes('x.com/') ||
    lower.includes('twitter.com/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('dailymotion.com/') ||
    lower.includes('reddit.com/') ||
    lower.includes('threads.net/') ||
    lower.includes('pinterest.com/');
};

export const getParentFolderName = (filePath: string) => {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  if (parts.length > 1) {
    return parts[parts.length - 2];
  }
  return '';
};

export const getNormalizedName = (filename: string) => {
  if (!filename) return '';
  const extIndex = filename.lastIndexOf('.');
  const ext = extIndex !== -1 ? filename.substring(extIndex) : '';
  const base = extIndex !== -1 ? filename.substring(0, extIndex) : filename;

  // Remove common suffixes like " (1)", " (2)", "_1", "_2", " - Copy", " (Copy)"
  const normalizedBase = base
    .replace(/\s*\(\d+\)$/g, '')
    .replace(/_\d+$/g, '')
    .replace(/\s*-\s*Copy$/gi, '')
    .replace(/\s*\(Copy\)$/gi, '')
    .trim()
    .toLowerCase();

  return normalizedBase + ext.toLowerCase();
};

export const getFriendlyErrorMessage = (rawError: string): string => {
  if (!rawError) return 'An unknown error occurred during installation.';
  const lower = rawError.toLowerCase();

  if (lower.includes('econnreset') || lower.includes('connection reset')) {
    return 'Connection was interrupted. Please check your internet connection and try again.';
  }
  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return 'Connection refused by the server. The download server might be temporarily offline or blocked.';
  }
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('getaddrinfo')) {
    return 'Could not reach the server. Please check your internet connection.';
  }
  if (lower.includes('etimeout') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'The connection timed out. Please check your internet speed and try again.';
  }

  return `Installation failed: ${rawError}. Please verify your connection.`;
};
