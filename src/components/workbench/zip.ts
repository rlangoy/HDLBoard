// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * A minimal ZIP writer for "Download All" — stored entries only (no
 * compression), which every unzip tool, Windows Explorer and macOS
 * Finder open. A project is a handful of small text files, so deflate
 * would save a few kilobytes at the cost of a dependency; this project
 * keeps "no runtime deps beyond React" (README "Prerequisites").
 *
 * Format: PKWARE APPNOTE.TXT — a local header + data per entry, then a
 * central directory and the end-of-central-directory record. No ZIP64,
 * so the limits are 65535 entries and 4 GiB, far above any project here.
 * ------------------------------------------------------------------ */

export interface ZipEntry {
  /** Path inside the archive, `/`-separated (e.g. `vhdl/DE1_SoC.vhdl`). */
  path: string;
  /** Text is stored as UTF-8. */
  data: string | Uint8Array;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32 (IEEE 802.3), as ZIP requires. */
export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time/date words, local time, 2-second resolution, 1980 floor. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// General-purpose flag bit 11: file names are UTF-8, so a name like
// "tellerØ.vhd" survives the round trip instead of becoming mojibake.
const FLAG_UTF8 = 0x0800;

/** Builds a complete .zip archive in memory. */
export function createZip(entries: ZipEntry[], modified: Date = new Date()) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);

  const prepared = entries.map((e) => {
    const name = encoder.encode(e.path);
    const data = typeof e.data === 'string' ? encoder.encode(e.data) : e.data;
    return { name, data, crc: crc32(data) };
  });

  const localSize = prepared.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = prepared.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };

  const offsets: number[] = [];
  for (const e of prepared) {
    offsets.push(p);
    u32(0x04034b50); // local file header signature
    u16(20); // version needed to extract (2.0)
    u16(FLAG_UTF8);
    u16(0); // method: stored
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.length); // compressed size
    u32(e.data.length); // uncompressed size
    u16(e.name.length);
    u16(0); // extra field length
    bytes(e.name);
    bytes(e.data);
  }

  const centralStart = p;
  prepared.forEach((e, i) => {
    u32(0x02014b50); // central directory header signature
    u16(20); // version made by (2.0, MS-DOS attributes)
    u16(20); // version needed to extract
    u16(FLAG_UTF8);
    u16(0); // method: stored
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra field length
    u16(0); // comment length
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    bytes(e.name);
  });

  u32(0x06054b50); // end of central directory signature
  u16(0); // this disk
  u16(0); // disk with central directory
  u16(prepared.length);
  u16(prepared.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length

  return out;
}

/* ------------------------------------------------------------------ *
 * Reading — for "Upload File" with a .zip, e.g. one "Download All"
 * made. Stored entries (ours) and deflated ones (Windows Explorer,
 * macOS Finder, 7-Zip) are read; deflate goes through the browser's
 * own DecompressionStream, so there is still no dependency. Entries
 * are found through the central directory, which is the one that
 * holds the true sizes when a writer streamed its local headers.
 * ------------------------------------------------------------------ */

/** A file found in an archive: its full path and its bytes. */
export interface ZipFile {
  path: string;
  data: Uint8Array<ArrayBuffer>;
}

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Every file in a .zip, in archive order; folders are left out. Throws if `bytes`
 * is not a ZIP archive, or an entry is encrypted or packed some other way.
 */
export async function readZip(bytes: Uint8Array<ArrayBuffer>): Promise<ZipFile[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is 22 bytes plus a comment of up to 64 KiB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const files: ZipFile[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('damaged central directory');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const path = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith('/')) continue; // a folder
    if (flags & 1) throw new Error(`${path} is encrypted`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`damaged entry ${path}`);
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const packed = bytes.slice(start, start + compressedSize);
    if (method === METHOD_STORED) files.push({ path, data: packed });
    else if (method === METHOD_DEFLATE) files.push({ path, data: await inflateRaw(packed) });
    else throw new Error(`${path} uses an unsupported compression method`);
  }
  return files;
}
