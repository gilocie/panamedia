// Minimal PE import-table reader: lists the DLLs and the imported function
// names of a PE executable. Used to prove, from the built binary rather than
// from the source, that panamedia-core.exe cannot reach any shutdown API.
//
// Usage: node verify-pe-imports.cjs <path-to.exe>

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node verify-pe-imports.cjs <exe>');
  process.exit(2);
}

const buf = fs.readFileSync(file);

if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not an MZ executable');
const peOff = buf.readUInt32LE(0x3c);
if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('no PE signature');

const coff = peOff + 4;
const numSections = buf.readUInt16LE(coff + 2);
const optSize = buf.readUInt16LE(coff + 16);
const opt = coff + 20;
const magic = buf.readUInt16LE(opt);
const pe32plus = magic === 0x20b;
const dataDir = opt + (pe32plus ? 112 : 96);

// Import table is data directory entry 1.
const importRva = buf.readUInt32LE(dataDir + 8);
const importSize = buf.readUInt32LE(dataDir + 12);

const sections = [];
for (let i = 0; i < numSections; i++) {
  const sh = opt + optSize + i * 40;
  sections.push({
    name: buf.toString('ascii', sh, sh + 8).replace(/\0+$/, ''),
    vaddr: buf.readUInt32LE(sh + 12),
    vsize: buf.readUInt32LE(sh + 8),
    rawOff: buf.readUInt32LE(sh + 20),
    rawSize: buf.readUInt32LE(sh + 16),
  });
}

function rvaToOffset(rva) {
  for (const s of sections) {
    if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) {
      return s.rawOff + (rva - s.vaddr);
    }
  }
  return -1;
}

const cstr = (off) => {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('ascii', off, end);
};

const result = [];
if (importRva === 0) {
  result.push({ dll: '(no import table)', functions: [] });
} else {
  let idt = rvaToOffset(importRva);
  if (idt < 0) throw new Error(`import RVA 0x${importRva.toString(16)} is not inside any section`);
  for (;;) {
    const origThunk = buf.readUInt32LE(idt);
    const nameRva = buf.readUInt32LE(idt + 12);
    const firstThunk = buf.readUInt32LE(idt + 16);
    if (origThunk === 0 && nameRva === 0 && firstThunk === 0) break;
    const entry = { dll: cstr(rvaToOffset(nameRva)), functions: [] };
    // 32-bit PE: array of 32-bit RVAs. PE32+: array of 64-bit RVAs.
    const thunkRva = origThunk || firstThunk;
    let t = rvaToOffset(thunkRva);
    const step = pe32plus ? 8 : 4;
    const ordinalFlag = pe32plus ? 0x8000000000000000n : 0x80000000;
    while (t > 0 && t < buf.length) {
      const raw = pe32plus ? buf.readBigUInt64LE(t) : BigInt(buf.readUInt32LE(t));
      if (raw === 0n) break;
      if ((raw & ordinalFlag) !== 0n) {
        entry.functions.push(`#${raw & 0xffffn}`);
      } else {
        const hintOff = rvaToOffset(Number(raw));
        if (hintOff < 0) break;
        entry.functions.push(cstr(hintOff + 2));
      }
      t += step;
    }
    result.push(entry);
    idt += 20;
  }
}

let total = 0;
console.log(`${file}`);
console.log(`  ${importSize === 0 ? 'no' : importSize} bytes of import table, PE32${pe32plus ? '+' : ''}\n`);
for (const e of result) {
  total += e.functions.length;
  console.log(`  ${e.dll}  (${e.functions.length})`);
  const sorted = [...e.functions].sort();
  const wide = sorted.length > 14;
  for (let i = 0; i < sorted.length; i += (wide ? 4 : 1)) {
    const row = sorted.slice(i, i + (wide ? 4 : 1));
    console.log('      ' + row.map((f) => f.padEnd(28)).join('').trimEnd());
  }
  console.log('');
}
console.log(`  ${result.length} DLLs, ${total} imported functions`);