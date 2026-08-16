// Codec PNG minimal, sans dépendance : node:zlib suffit.
// Utilisé uniquement par les outils de dev (tools/), jamais au runtime du jeu.
// Supporte en lecture : bit depth 8, color types 0/2/3/4/6, non entrelacé.
// Écrit toujours du RGBA8 non entrelacé.

import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Décode un PNG en image RGBA8.
 * @returns {{width:number, height:number, data:Uint8Array}} data = w*h*4 octets
 */
export function decodePNG(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('signature PNG invalide');

  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];

  let off = 8;
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString('ascii', off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    off += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }

  if (interlace !== 0) throw new Error('PNG entrelacé non supporté');
  if (depth !== 8) throw new Error(`profondeur ${depth} non supportée (8 attendue)`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`color type ${colorType} inconnu`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels; // depth 8 → 1 octet par canal
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  // Défiltrage ligne par ligne.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      switch (filter) {
        case 0: out[x] = v; break;
        case 1: out[x] = (v + a) & 0xff; break;
        case 2: out[x] = (v + b) & 0xff; break;
        case 3: out[x] = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: out[x] = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`filtre ${filter} inconnu (ligne ${y})`);
      }
    }
  }

  // Expansion vers RGBA8.
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * bpp, d = i * 4;
    switch (colorType) {
      case 0: { // niveaux de gris
        const g = pixels[s];
        rgba[d] = rgba[d + 1] = rgba[d + 2] = g;
        rgba[d + 3] = trns && trns.readUInt16BE(0) === g ? 0 : 255;
        break;
      }
      case 2: { // RGB
        rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2];
        const isTrns = trns && trns.readUInt16BE(0) === pixels[s]
          && trns.readUInt16BE(2) === pixels[s + 1] && trns.readUInt16BE(4) === pixels[s + 2];
        rgba[d + 3] = isTrns ? 0 : 255;
        break;
      }
      case 3: { // palette
        const idx = pixels[s];
        rgba[d] = palette[idx * 3]; rgba[d + 1] = palette[idx * 3 + 1]; rgba[d + 2] = palette[idx * 3 + 2];
        rgba[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
        break;
      }
      case 4: { // gris + alpha
        const g = pixels[s];
        rgba[d] = rgba[d + 1] = rgba[d + 2] = g;
        rgba[d + 3] = pixels[s + 1];
        break;
      }
      case 6: { // RGBA
        rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1];
        rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = pixels[s + 3];
        break;
      }
    }
  }

  return { width, height, data: rgba };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy ? data.copy(out, 8) : Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode une image RGBA8 en PNG (color type 6, filtre adaptatif simple).
 */
export function encodePNG({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));

  // Filtre choisi ligne par ligne, à la somme des écarts absolus — l'heuristique
  // recommandée par la spec PNG. Sur une planche de sprites elle divise par deux
  // le poids par rapport à un filtre fixe.
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const src = y * stride;
    const prevRow = y > 0 ? (y - 1) * stride : -1;
    const at = (o) => (o >= 0 ? data[o] : 0);

    for (let x = 0; x < stride; x++) {
      const v = data[src + x];
      const a = x >= 4 ? data[src + x - 4] : 0;
      const b = prevRow >= 0 ? at(prevRow + x) : 0;
      const c = prevRow >= 0 && x >= 4 ? at(prevRow + x - 4) : 0;
      cand[0][x] = v;
      cand[1][x] = (v - a) & 0xff;
      cand[2][x] = (v - b) & 0xff;
      cand[3][x] = (v - ((a + b) >> 1)) & 0xff;
      cand[4][x] = (v - paeth(a, b, c)) & 0xff;
    }

    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const s = cand[f][x];
        sum += s < 128 ? s : 256 - s;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }

    const dst = y * (stride + 1);
    raw[dst] = best;
    cand[best].copy(raw, dst + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filtre
  ihdr[12] = 0;  // pas d'entrelacement

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
