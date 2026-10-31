// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The standard VHDL packages a beginner forgets to `use`, and the names each one
 * declares — so "no declaration for "unsigned"" can be answered with the package
 * that declares it. Pure data, plus one lookup.
 */

/** A package as a `use` clause names it: `use <library>.<name>.all;`. */
export interface VhdlPackage {
  readonly library: string;
  readonly name: string;
}

interface PackageEntry {
  readonly package: VhdlPackage;
  /** The declarations a beginner writes, lower case. */
  readonly declares: readonly string[];
  /** Packages that declare the same names differently: using both makes them ambiguous. */
  readonly clashesWith: readonly VhdlPackage[];
}

/** Libraries every design unit sees without a `library` clause (IEEE 1076-2008 § 13.2). */
const IMPLICIT_LIBRARIES: ReadonlySet<string> = new Set(['std', 'work']);

const STD_LOGIC_ARITH: VhdlPackage = { library: 'ieee', name: 'std_logic_arith' };
const STD_LOGIC_UNSIGNED: VhdlPackage = { library: 'ieee', name: 'std_logic_unsigned' };
const STD_LOGIC_SIGNED: VhdlPackage = { library: 'ieee', name: 'std_logic_signed' };

const PACKAGES: readonly PackageEntry[] = [
  {
    package: { library: 'ieee', name: 'std_logic_1164' },
    declares: [
      'std_logic', 'std_ulogic', 'std_logic_vector', 'std_ulogic_vector', 'rising_edge', 'falling_edge',
      'resolved', 'x01', 'x01z', 'ux01', 'ux01z', 'to_bit', 'to_bitvector', 'to_stdulogic',
      'to_stdlogicvector', 'to_stdulogicvector', 'to_x01', 'to_x01z', 'to_ux01', 'is_x',
    ],
    clashesWith: [],
  },
  {
    package: { library: 'ieee', name: 'numeric_std' },
    declares: [
      'unsigned', 'signed', 'unresolved_unsigned', 'unresolved_signed', 'u_unsigned', 'u_signed',
      'to_integer', 'to_unsigned', 'to_signed', 'resize', 'shift_left', 'shift_right',
      'rotate_left', 'rotate_right', 'std_match', 'to_01',
    ],
    clashesWith: [STD_LOGIC_ARITH, STD_LOGIC_UNSIGNED, STD_LOGIC_SIGNED],
  },
  {
    package: { library: 'ieee', name: 'math_real' },
    declares: [
      'math_pi', 'math_e', 'ceil', 'floor', 'round', 'trunc', 'sqrt', 'cbrt', 'exp', 'log', 'log2',
      'log10', 'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'uniform', 'realmax', 'realmin',
    ],
    clashesWith: [],
  },
  {
    package: { library: 'std', name: 'textio' },
    declares: [
      'line', 'text', 'side', 'width', 'readline', 'writeline', 'read', 'write', 'endfile',
      'input', 'output', 'hread', 'hwrite', 'oread', 'owrite',
    ],
    clashesWith: [],
  },
];

const ENTRY_BY_NAME: ReadonlyMap<string, PackageEntry> = new Map(
  PACKAGES.flatMap((entry) => entry.declares.map((name) => [name, entry] as const)),
);

/** The package that declares `name` (any case), if it is one of the packages above. */
export function packageDeclaring(name: string): VhdlPackage | undefined {
  return ENTRY_BY_NAME.get(name.toLowerCase())?.package;
}

/** The packages that cannot be used together with `pkg`. */
export function packagesClashingWith(pkg: VhdlPackage): readonly VhdlPackage[] {
  return PACKAGES.find((entry) => isSamePackage(entry.package, pkg))?.clashesWith ?? [];
}

export function isSamePackage(a: VhdlPackage, b: VhdlPackage): boolean {
  return a.library.toLowerCase() === b.library.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();
}

/** Whether a design unit needs `library <name>;` before it can `use` the package. */
export function needsLibraryClause(pkg: VhdlPackage): boolean {
  return !IMPLICIT_LIBRARIES.has(pkg.library.toLowerCase());
}

/** `ieee.numeric_std` */
export function packagePath(pkg: VhdlPackage): string {
  return `${pkg.library}.${pkg.name}`;
}

/** `use ieee.numeric_std.all;` */
export function useClauseText(pkg: VhdlPackage): string {
  return `use ${packagePath(pkg)}.all;`;
}

/** `library ieee;` */
export function libraryClauseText(pkg: VhdlPackage): string {
  return `library ${pkg.library};`;
}
