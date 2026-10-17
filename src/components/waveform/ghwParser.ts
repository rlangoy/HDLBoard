// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHW bytes → `WaveformData` (docs/waveform_viewer_spec.md § 8.3). GHW is GHDL's own
 * waveform format and carries every VHDL type – above all enumerations, so a state
 * machine's state is shown by name (W2).
 *
 * The layout follows GHDL's reader `libghw` (GPL-2.0-or-later): a header, then sections
 * tagged `STR`, `TYP`, `WKT`, `HIE`, `EOH`, followed by snapshots (`SNP`) and cycles
 * (`CYC`). Numbers are LEB128; a basic signal is one scalar, and a declared signal is
 * one or more of them (a vector, a record). The parts live in `ghw/`.
 *
 * A run that was stopped leaves the file cut off anywhere. A cut inside the header is
 * an error; a cut inside the value data is the end of the data: everything up to the
 * last complete cycle is kept and `truncated` is set (§ 4). Pure.
 */

import { WaveParseError, type RunWaveStatus, type WaveformData } from './model';
import { HierarchyReader, type Hierarchy } from './ghw/ghwHierarchy';
import { EndOfData, Reader } from './ghw/ghwReader';
import { SECTION_HEADER_LENGTH, TypeReader, type Header } from './ghw/ghwTypes';
import { ValueReader } from './ghw/ghwValues';

const MAGIC = 'GHDLwave\n';
const HEADER_LENGTH = 16;
const LITTLE_ENDIAN_MARK = 1;
const BIG_ENDIAN_MARK = 2;

const STRING_CONTINUES = 0x80;
const STRING_TERMINATOR_MAX = 31;
const STRING_CONTINUATION_MIN = 128;
const STRING_CONTINUATION_MAX = 159;
const PREFIX_BITS = 5;
const PREFIX_MASK = 0x1f;

function readMagic(r: Reader): string {
  let magic = '';
  for (let i = 0; i < MAGIC.length; i++) magic += String.fromCharCode(r.byte());
  return magic;
}

function readHeader(r: Reader): void {
  if (r.atEnd) throw new WaveParseError('The waveform file is empty.');
  if (readMagic(r) !== MAGIC) throw new WaveParseError('This is not a GHW waveform file.');
  const rest: number[] = [];
  for (let i = MAGIC.length; i < HEADER_LENGTH; i++) rest.push(r.byte());
  const [headerLength, major, , endian] = rest;
  if (headerLength !== HEADER_LENGTH || major !== 0) throw new WaveParseError('This GHW waveform file is of a version the viewer does not know.');
  if (endian !== LITTLE_ENDIAN_MARK && endian !== BIG_ENDIAN_MARK) throw new WaveParseError('This GHW waveform file has an unknown byte order.');
  r.littleEndian = endian === LITTLE_ENDIAN_MARK;
}

const isStringEnd = (c: number) => c <= STRING_TERMINATOR_MAX || (c >= STRING_CONTINUATION_MIN && c <= STRING_CONTINUATION_MAX);

/** One string's own characters, and the byte that ended it. */
function readStringBody(r: Reader): { readonly text: string; readonly end: number } {
  const chars: number[] = [];
  for (let c = r.byte(); ; c = r.byte()) {
    if (isStringEnd(c)) return { text: String.fromCharCode(...chars), end: c };
    chars.push(c);
  }
}

/** The terminator, and the bytes after it, hold how much of this string the next one starts with. */
function readPrefixLength(r: Reader, end: number): number {
  let prefixLength = end & PREFIX_MASK;
  for (let c = end, shift = PREFIX_BITS; c & STRING_CONTINUES; shift += PREFIX_BITS) {
    c = r.byte();
    prefixLength |= (c & PREFIX_MASK) << shift;
  }
  return prefixLength;
}

/** `STR`: every string starts with a part of the one before it. */
function readStrings(r: Reader): string[] {
  r.skip(SECTION_HEADER_LENGTH);
  const count = r.i32() + 1;
  r.i32(); // total size of the strings, not needed here
  const strings: string[] = ['<anon>'];
  for (let i = 1, prefixLength = 0; i < count; i++) {
    const previous = i === 1 ? '' : strings[i - 1];
    const { text, end } = readStringBody(r);
    strings.push(previous.slice(0, prefixLength) + text);
    prefixLength = readPrefixLength(r, end);
  }
  if (r.tag() !== 'EOS') throw new WaveParseError('The waveform file has a damaged string table.');
  return strings;
}

/** The sections up to `EOH`: strings, types and the hierarchy. */
function readSections(r: Reader): Hierarchy {
  const header: Header = { strings: [], types: [] };
  const types = new TypeReader(r, header);
  let hierarchy: Hierarchy | undefined;
  for (let tag = r.tag(); tag !== 'EOH'; tag = r.tag()) {
    if (tag === 'STR') header.strings = readStrings(r);
    else if (tag === 'TYP') types.read();
    else if (tag === 'WKT') types.readWellKnown();
    else if (tag === 'HIE') hierarchy = readHierarchy(r, header);
    else throw new WaveParseError(`The waveform file has a section the viewer does not know: ${tag}.`);
  }
  if (hierarchy === undefined) throw new WaveParseError('The waveform file has no list of signals.');
  return hierarchy;
}

function readHierarchy(r: Reader, header: Header): Hierarchy {
  const reader = new HierarchyReader(r, header);
  reader.read();
  return reader.result;
}

/** The header and the list of signals; a file that ends inside them cannot be shown. */
function readDefinitions(r: Reader): Hierarchy {
  try {
    readHeader(r);
    return readSections(r);
  } catch (e) {
    if (e instanceof EndOfData) throw new WaveParseError('The waveform file ends before its list of signals is complete.');
    throw e;
  }
}

export function parseGhw(bytes: Uint8Array, status: RunWaveStatus = 'complete'): WaveformData {
  const r = new Reader(bytes);
  const hierarchy = readDefinitions(r);
  const values = new ValueReader(r, hierarchy);
  values.read();
  return {
    source: { format: 'ghw', status, truncated: values.truncated },
    tickFs: 1,
    endTime: values.endTime,
    root: hierarchy.tree.build(),
    traces: values.traces(),
  };
}
