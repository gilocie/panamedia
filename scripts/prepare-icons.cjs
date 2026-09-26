/**
 * prepare-icons.cjs
 * Copies the generated PNG icons into the build/ folder so electron-builder
 * can find them.  If png-to-ico is available we also write a proper .ico;
 * otherwise we just use the PNG directly (electron-builder accepts PNG on
 * Windows too when using NSIS).
 */
const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');

if (!fs.existsSync(BUILD)) fs.mkdirSync(BUILD, { recursive: true });

// Source PNGs we generated (placed in public/ for Vite access)
const sources = [
  { src: path.join(ROOT, 'public', 'panamedia_icon.png'), dest: path.join(BUILD, 'icon.png') },
  { src: path.join(ROOT, 'public', 'player_icon.png'),    dest: path.join(BUILD, 'player_icon.png') },
];

for (const { src, dest } of sources) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${path.basename(src)} → ${dest}`);
  } else {
    console.warn(`Source not found: ${src}`);
  }
}

console.log('Icons ready in build/');
