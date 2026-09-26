/**
 * Dedicated YouTube Downloader Module
 * Handles all YouTube-specific format extraction, playlists, and yt-dlp downloading.
 * Completely isolated from custom web video streams.
 */

const path = require('path');
const fs = require('fs');
const {
  getVideoFormats,
  downloadYoutubeVideo,
  getPlaylistInfo,
  cleanYoutubeUrl,
  ffmpegPath,
  ffprobePath,
  resolveBinary
} = require('../youtube.cjs');

function isYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return clean.includes('youtube.com/') || clean.includes('youtu.be/');
}

module.exports = {
  isYoutubeUrl,
  getVideoFormats,
  downloadYoutubeVideo,
  getPlaylistInfo,
  cleanYoutubeUrl,
  ffmpegPath,
  ffprobePath,
  resolveBinary
};
