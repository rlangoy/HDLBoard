/** A single logic level as shown on the board. */
export type Bit = 0 | 1;

/**
 * Bit vector for a board group.
 *
 * Index convention: `bits[i]` is bit *i* — index 0 is the LSB, exactly as
 * in VHDL `SW : in std_logic_vector(9 downto 0)`. Panels render MSB-first
 * (bit 9 leftmost), so the on-screen order is the reverse of the array
 * order. This keeps the array indexable the way the VHDL port is.
 */
export type BitVector = Bit[];

/** Vector of the given length with every bit set to `bit`. */
export const fillBits = (count: number, bit: Bit): BitVector =>
  Array.from({ length: count }, () => bit);

/** All-zero vector of the given length. */
export const zeroBits = (count: number): BitVector => fillBits(count, 0);

/** `[0,1,1,0]` → `"0110"` — MSB first, the way a readout prints it. */
export const bitsToString = (bits: BitVector): string =>
  [...bits].reverse().join('');

/** `[0,1,1,0]` → `6` (bits[0] is the LSB). */
export const bitsToNumber = (bits: BitVector): number =>
  bits.reduce<number>((acc, bit, i) => acc + (bit ? 2 ** i : 0), 0);

/** `6, 4` → `[0,1,1,0]` (LSB first). */
export const numberToBits = (value: number, count: number): BitVector =>
  Array.from({ length: count }, (_, i) => ((value >> i) & 1) as Bit);

/** Normalise any source vector to exactly `count` bits, LSB first. */
export const coerceBits = (
  source: readonly (Bit | number | undefined)[],
  count: number,
): BitVector =>
  Array.from({ length: count }, (_, i) => (source[i] ? 1 : 0) as Bit);
