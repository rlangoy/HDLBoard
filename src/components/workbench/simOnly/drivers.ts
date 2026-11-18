// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The multiple-driver check (docs/impl_sim_only_warnings.md § 8.1). On the FPGA a
 * signal is one wire with one source; two processes, or a process and a concurrent
 * statement, that both drive the same bits fight, and Quartus refuses the design
 * ("can't resolve multiple constant drivers"). The simulator resolves it to 'X'.
 * One driver is one process / `always` block, or one concurrent statement. A driver
 * that drives 'Z' is a tri-state bus and never clashes. Pure; each body's drivers are
 * cached with the file's scan.
 */

import type { CodeBlock, FileAnalysis } from '../tbDetect/types';
import { overlap } from './bits';
import { DRIVER_LANGUAGES, type BodyText, type DriverLanguage } from './driverLanguages';
import type { Assignment, BodyDrivers, Driver, DriverConflict } from './driverTypes';
import { isHidden, scannedFile, type ScannedFile, type ScannedUnit } from './scan';
import type { DesignView } from './types';
import { definedUnitKey, unitRefKey } from './unitRef';

const cache = new WeakMap<FileAnalysis, readonly BodyDrivers[]>();

/** The drivers of every architecture and module of the file. */
export function bodyDriversOf(file: FileAnalysis): readonly BodyDrivers[] {
  const cached = cache.get(file);
  if (cached) return cached;
  const scan = scannedFile(file);
  const bodies = scan.units.flatMap((unit) => bodiesOf(scan, unit));
  cache.set(file, bodies);
  return bodies;
}

const ARCHITECTURE_START = /^\s*architecture\b/i;

/** VHDL: each architecture of the unit, alternatives of each other; Verilog: the module. */
function bodiesOf(scan: ScannedFile, { unit, ownsUnit }: ScannedUnit): BodyDrivers[] {
  const ranges = scan.file.language === 'vhdl'
    ? unit.ranges.filter((r) => ARCHITECTURE_START.test(scan.code.slice(r.from, r.to)))
    : unit.ranges;
  const language = DRIVER_LANGUAGES[scan.file.language];
  return ranges.map((r) => {
    const body: BodyText = { code: scan.code, source: scan.file.content, from: r.from, to: r.to };
    const blocks = unit.blocks.filter((b) => b.from >= r.from && b.to <= r.to);
    const drivers = driversIn({ scan, language, blocks }, language.assignments(body));
    return { fileId: scan.file.fileId, unitName: unit.name, ownsUnit, drivers, declared: language.declared(body) };
  });
}

interface BodyContext {
  readonly scan: ScannedFile;
  readonly language: DriverLanguage;
  readonly blocks: readonly CodeBlock[];
}

/** Assignments grouped by source and signal; those in code hidden from synthesis, or in an `initial` block, drive nothing. */
function driversIn(context: BodyContext, assignments: readonly Assignment[]): Driver[] {
  const drivers = new Map<string, Driver>();
  for (const driven of assignments.flatMap((a) => drivenBy(context, a))) {
    const id = `${driven.source}:${driven.signal}`;
    const known = drivers.get(id);
    drivers.set(id, known ? withAssignment(known, driven) : driven);
  }
  return [...drivers.values()];
}

/** The assignment as a driver of its own, or nothing when it drives nothing on the FPGA. */
function drivenBy({ scan, language, blocks }: BodyContext, a: Assignment): Driver[] {
  const line = scan.lineOf(a.at);
  const block = blocks.find((b) => a.at >= b.from && a.at < b.to);
  if (isHidden(line, scan.hidden) || (block && block.kind !== language.drivingBlock)) return [];
  const source = block?.from ?? a.at;
  return [{ source, signal: language.key(a.target), name: a.target, bits: [a.bits], line, tristate: a.tristate }];
}

/** A later assignment of the same source: its bits join the driver, which keeps its first line. */
const withAssignment = (driver: Driver, later: Driver): Driver => ({
  ...driver,
  bits: [...driver.bits, ...later.bits],
  tristate: driver.tristate || later.tristate,
});

/** Every driver in hardware code that clashes with another driver of the same bits. */
export function driverConflicts(view: DesignView): DriverConflict[] {
  return [...view.raw.byFile.values()].flatMap((file) =>
    bodyDriversOf(file)
      .filter((body) => isHardware(view, body))
      .flatMap((body) => conflictsIn(body, signalsOf(view, body))),
  );
}

function unitKeyOf(view: DesignView, body: BodyDrivers): string | undefined {
  const language = view.raw.byFile.get(body.fileId)?.language;
  if (language === undefined) return undefined;
  return body.ownsUnit ? unitRefKey(body.fileId, language, body.unitName) : definedUnitKey(view.raw, language, body.unitName);
}

const isHardware = (view: DesignView, body: BodyDrivers): boolean => {
  const key = unitKeyOf(view, body);
  return key !== undefined && view.hardware.hardware.has(key);
};

/** The names a body can drive: its declared signals and its unit's ports, which may be in another file (§ 4.1). */
function signalsOf(view: DesignView, body: BodyDrivers): Set<string> {
  const file = view.raw.byFile.get(body.fileId);
  if (!file) return new Set();
  const key = DRIVER_LANGUAGES[file.language].key;
  const unitKey = unitKeyOf(view, body);
  const units = [...view.raw.byFile.values()].flatMap((f) => f.units.map((u) => ({ key: unitRefKey(f.fileId, f.language, u.name), u })));
  const ports = units.find((entry) => entry.key === unitKey)?.u.portNames ?? [];
  return new Set([...body.declared, ...ports].map(key));
}

function conflictsIn(body: BodyDrivers, signals: ReadonlySet<string>): DriverConflict[] {
  const drivers = body.drivers.filter((d) => signals.has(d.signal) && !d.tristate);
  return drivers.flatMap((driver) => {
    const others = drivers.filter((d) => d !== driver && d.signal === driver.signal && clash(d, driver));
    if (others.length === 0) return [];
    return [{ fileId: body.fileId, line: driver.line, signal: driver.name, otherLines: others.map((d) => d.line).sort((a, b) => a - b) }];
  });
}

const clash = (a: Driver, b: Driver): boolean => a.bits.some((x) => b.bits.some((y) => overlap(x, y)));
