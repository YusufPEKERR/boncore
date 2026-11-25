import React from 'react';

/**
 * Standard ISO/IEC 18004 QR Code Generator (Byte Mode, ECC Level L, Versions 1–10).
 * Generates genuine, camera-scannable QR matrices and crisp SVG elements with zero external dependencies.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  ecPerBlock: number;
  blocks: number[];
  alignment: number[];
  maxBytes: number;
}

const QR_VERSIONS: QrVersionSpec[] = [
  { version: 1, size: 21, ecPerBlock: 7, blocks: [19], alignment: [], maxBytes: 17 },
  { version: 2, size: 25, ecPerBlock: 10, blocks: [34], alignment: [6, 18], maxBytes: 32 },
  { version: 3, size: 29, ecPerBlock: 15, blocks: [55], alignment: [6, 22], maxBytes: 53 },
  { version: 4, size: 33, ecPerBlock: 20, blocks: [80], alignment: [6, 26], maxBytes: 78 },
  { version: 5, size: 37, ecPerBlock: 26, blocks: [108], alignment: [6, 30], maxBytes: 106 },
  { version: 6, size: 41, ecPerBlock: 18, blocks: [68, 68], alignment: [6, 34], maxBytes: 134 },
  { version: 7, size: 45, ecPerBlock: 20, blocks: [78, 78], alignment: [6, 22, 38], maxBytes: 154 },
  { version: 8, size: 49, ecPerBlock: 24, blocks: [97, 97], alignment: [6, 24, 42], maxBytes: 192 },
  { version: 9, size: 53, ecPerBlock: 30, blocks: [116, 116], alignment: [6, 26, 46], maxBytes: 230 },
  { version: 10, size: 57, ecPerBlock: 18, blocks: [68, 68, 69, 69], alignment: [6, 28, 50], maxBytes: 271 },
];

// GF(256) lookup tables with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_LOG[val] = i;
    val <<= 1;
    if (val & 0x100) {
      val ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(ecLen: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLen; i++) {
    const factor = [1, GF_EXP[i]];
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        next[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: number[], ecLen: number): number[] {
  const gen = buildRsGenerator(ecLen);
  const work = new Array(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    work[i] = data[i];
  }
  for (let i = 0; i < data.length; i++) {
    const coef = work[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        work[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return work.slice(data.length);
}

function encodeUtf8Bytes(text: string): number[] {
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(text));
  }
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
}

function encodeDataCodewords(bytes: number[], spec: QrVersionSpec): number[] {
  const totalDataCw = spec.blocks.reduce((sum, n) => sum + n, 0);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode 0100 (Byte), character count length (8 bits for v1..9, 16 bits for v10+)
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.version >= 10 ? 16 : 8);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zero bits)
  const capBits = totalDataCw * 8;
  const termLen = Math.min(4, capBits - bits.length);
  pushBits(0, termLen);

  // Byte alignment padding
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let cw = 0;
    for (let b = 0; b < 8; b++) {
      cw = (cw << 1) | bits[i + b];
    }
    codewords.push(cw);
  }

  // Alternating pad bytes 0xec and 0x11
  let toggle = true;
  while (codewords.length < totalDataCw) {
    codewords.push(toggle ? 0xec : 0x11);
    toggle = !toggle;
  }

  // Split into RS blocks, compute EC, then interleave data and EC codewords
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const blockLen of spec.blocks) {
    const slice = codewords.slice(offset, offset + blockLen);
    offset += blockLen;
    dataBlocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecPerBlock));
  }

  const interleaved: number[] = [];
  const maxDataLen = Math.max(...spec.blocks);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ecBlk of ecBlocks) {
      interleaved.push(ecBlk[i]);
    }
  }
  return interleaved;
}

function getFormatInfoBits(maskId: number): number {
  // Error Correction Level L = 01
  const data = (0b01 << 3) | (maskId & 7);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function getVersionInfoBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function isMasked(maskId: number, r: number, c: number): boolean {
  switch (maskId) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function scoreMatrixPenalty(grid: boolean[][]): number {
  const n = grid.length;
  let penalty = 0;

  // N1: 5+ consecutive same-color modules in rows and columns
  for (let r = 0; r < n; r++) {
    let runLen = 1;
    let colRun = 1;
    for (let i = 1; i < n; i++) {
      if (grid[r][i] === grid[r][i - 1]) runLen++;
      else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runLen = 1;
      }
      if (grid[i][r] === grid[i - 1][r]) colRun++;
      else {
        if (colRun >= 5) penalty += 3 + (colRun - 5);
        colRun = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    if (colRun >= 5) penalty += 3 + (colRun - 5);
  }

  // N2: 2x2 same-color blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = grid[r][c];
      if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) {
        penalty += 3;
      }
    }
  }

  // N3: 1:1:3:1:1 finder-like patterns in rows or columns
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      let rMatchA = true;
      let rMatchB = true;
      let cMatchA = true;
      let cMatchB = true;
      for (let k = 0; k < 11; k++) {
        if (grid[r][c + k] !== patternA[k]) rMatchA = false;
        if (grid[r][c + k] !== patternB[k]) rMatchB = false;
        if (grid[c + k][r] !== patternA[k]) cMatchA = false;
        if (grid[c + k][r] !== patternB[k]) cMatchB = false;
      }
      if (rMatchA || rMatchB) penalty += 40;
      if (cMatchA || cMatchB) penalty += 40;
    }
  }

  // N4: dark/light proportion balance
  let darkCount = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) darkCount++;
    }
  }
  const percent = (darkCount * 100) / (n * n);
  const k = Math.floor(Math.abs(percent - 50) / 5);
  penalty += k * 10;

  return penalty;
}

export function generateQrMatrix(text: string): boolean[][] {
  const input = text && text.length > 0 ? text : 'http://localhost';
  let bytes = encodeUtf8Bytes(input);
  let spec = QR_VERSIONS.find((v) => bytes.length <= v.maxBytes);
  if (!spec) {
    spec = QR_VERSIONS[QR_VERSIONS.length - 1];
    bytes = bytes.slice(0, spec.maxBytes);
  }

  const size = spec.size;
  const codewords = encodeDataCodewords(bytes, spec);
  const dataBits: number[] = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) {
      dataBits.push((cw >> b) & 1);
    }
  }

  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const baseModules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      isFunc[r][c] = true;
      baseModules[r][c] = dark;
    }
  };

  // Finder patterns + white 1-module separators
  const placeFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const dark =
          !inSep &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, dark);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns (v2..v10)
  if (spec.alignment.length > 0) {
    const pos = spec.alignment;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const isCornerOverlap =
          (i === 0 && j === 0) ||
          (i === 0 && j === pos.length - 1) ||
          (i === pos.length - 1 && j === 0);
        if (isCornerOverlap) continue;
        const cr = pos[i];
        const cc = pos[j];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunc(cr + dr, cc + dc, dist !== 1);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!isFunc[6][i]) setFunc(6, i, dark);
    if (!isFunc[i][6]) setFunc(i, 6, dark);
  }

  // Always-dark module & reserve format/version areas
  setFunc(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) isFunc[8][i] = true;
    if (!isFunc[i][8]) isFunc[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunc[8][i]) isFunc[8][i] = true;
    if (!isFunc[i][8]) isFunc[i][8] = true;
  }

  if (spec.version >= 7) {
    const vBits = getVersionInfoBits(spec.version);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const bit = ((vBits >> (i * 3 + j)) & 1) === 1;
        setFunc(i, size - 11 + j, bit);
        setFunc(size - 11 + j, i, bit);
      }
    }
  }

  // Place data bits in zig-zag order skipping function modules
  const rawDataGrid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  let bitIdx = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const c = rightCol - offset;
        if (!isFunc[r][c]) {
          rawDataGrid[r][c] = bitIdx < dataBits.length ? dataBits[bitIdx] === 1 : false;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  const writeFormatInfo = (grid: boolean[][], maskId: number) => {
    const fmt = getFormatInfoBits(maskId);
    for (let i = 0; i < 15; i++) {
      const dark = ((fmt >> i) & 1) === 1;
      // Copy 1 (top-left)
      if (i < 6) grid[i][8] = dark;
      else if (i === 6) grid[7][8] = dark;
      else if (i === 7) grid[8][8] = dark;
      else if (i === 8) grid[8][7] = dark;
      else grid[8][14 - i] = dark;

      // Copy 2 (top-right and bottom-left)
      if (i < 8) grid[8][size - 1 - i] = dark;
      else grid[size - 15 + i][8] = dark;
    }
  };

  let bestGrid: boolean[][] | null = null;
  let bestScore = Infinity;

  for (let maskId = 0; maskId < 8; maskId++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) => (isFunc[r][c] ? val : rawDataGrid[r][c] !== isMasked(maskId, r, c)))
    );
    writeFormatInfo(candidate, maskId);
    const penalty = scoreMatrixPenalty(candidate);
    if (penalty < bestScore) {
      bestScore = penalty;
      bestGrid = candidate;
    }
  }

  return bestGrid || baseModules;
}

const TR_CHAR_MAP: Record<string, string> = {
  'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
  'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
};

/** Converts restaurant, area, or table names into clean URL-safe slugs (Turkish chars transliterated). */
export function slugifyQrPart(text: string, fallback: string = 'genel'): string {
  const mapped = String(text || '')
    .trim()
    .split('')
    .map((ch) => TR_CHAR_MAP[ch] || ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return mapped || fallback;
}

/** Builds the scannable QR menu URL in the order: restaurant name/code, table area, table name. */
export function buildTableQrMenuUrl(
  origin: string,
  restaurantName: string,
  areaName: string,
  tableName: string
): string {
  const cleanOrigin = String(origin || 'http://localhost').trim().replace(/\/+$/, '');
  const trimmedRest = String(restaurantName || '').trim();
  const rSlug = /^[a-zA-Z0-9_-]+$/.test(trimmedRest)
    ? trimmedRest
    : slugifyQrPart(trimmedRest, 'restoran');
  const bSlug = slugifyQrPart(areaName, 'salon');
  const mSlug = slugifyQrPart(tableName, 'masa');
  return `${cleanOrigin}/?restoran=${encodeURIComponent(rSlug)}&bolge=${encodeURIComponent(bSlug)}&masa=${encodeURIComponent(mSlug)}`;
}

export interface QrRouteMatch {
  restoran?: string;
  bolge?: string;
  masa?: string;
  tableId?: number;
}

/** Parses customer QR ordering routes from ?restoran=...&bolge=...&masa=..., /<restoran>/<bolge>/<masa>, or legacy ?qr_table=<id>. */
export function parseQrRouteFromUrl(search: string, pathname: string = '', hash: string = ''): QrRouteMatch | null {
  try {
    const searchParams = new URLSearchParams(search || '');
    const restoran = (searchParams.get('restoran') || searchParams.get('restaurant') || searchParams.get('tenant') || '').trim();
    const bolge = (searchParams.get('bolge') || searchParams.get('area') || '').trim();
    const masa = (searchParams.get('masa') || searchParams.get('table') || '').trim();
    const rawTableId = searchParams.get('qr_table');

    let tableId: number | undefined;
    if (rawTableId) {
      const parsed = Number(rawTableId);
      if (Number.isInteger(parsed) && parsed > 0) {
        tableId = parsed;
      }
    }
    if (!tableId && hash) {
      const hashMatch = String(hash).match(/qr_table=(\d+)/);
      if (hashMatch) {
        const parsed = Number(hashMatch[1]);
        if (Number.isInteger(parsed) && parsed > 0) {
          tableId = parsed;
        }
      }
    }

    if (restoran && (bolge || masa)) {
      return {
        restoran,
        bolge: bolge || undefined,
        masa: masa || undefined,
        tableId,
      };
    }

    const cleanPath = String(pathname || '').replace(/^\/+|\/+$/g, '');
    if (cleanPath && !cleanPath.startsWith('api/') && !cleanPath.startsWith('assets/')) {
      const segs = cleanPath.split('/').filter(Boolean);
      if (segs.length === 3) {
        return {
          restoran: decodeURIComponent(segs[0]),
          bolge: decodeURIComponent(segs[1]),
          masa: decodeURIComponent(segs[2]),
          tableId,
        };
      }
    }

    if (tableId) {
      return {
        restoran: restoran || undefined,
        tableId,
      };
    }
  } catch {}
  return null;
}

export interface QrCodeSvgProps {
  value: string;
  size?: number | string;
  className?: string;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 176, className = '' }) => {
  const matrix = React.useMemo(() => generateQrMatrix(value), [value]);
  const n = matrix.length;
  const quiet = 4;
  const viewSize = n + quiet * 2;

  const pathData = React.useMemo(() => {
    const parts: string[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
        }
      }
    }
    return parts.join('');
  }, [matrix, n]);

  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: `0 0 ${viewSize} ${viewSize}`,
      shapeRendering: 'crispEdges',
      role: 'img',
      'aria-label': `QR Kod: ${value}`,
      style: { width: size, height: size, maxWidth: '100%', display: 'block' },
      className: `bg-white rounded-xl ${className}`.trim(),
    },
    React.createElement('rect', { width: viewSize, height: viewSize, fill: '#ffffff' }),
    React.createElement('path', { d: pathData, fill: '#000000' })
  );
};
