// SPDX-License-Identifier: GPL-2.0-only
import { MAX_ID_LENGTH, MAX_NAME_LENGTH } from './parseBoards';

const COPY_SUFFIX = ' Custom';
type RawBoard = Record<string, unknown>;

/** `keepingId` is the board's own current ID, which does not count as taken. */
export function boardIdFromName(name: string, existing: readonly RawBoard[], keepingId?: string): string {
  const used = new Set(existing.filter((board) => board.id !== keepingId).map((board) => String(board.id)));
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, MAX_ID_LENGTH).replace(/^-|-$/g, '') || 'custom-board';
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    const ending = `-${suffix}`;
    id = `${base.slice(0, MAX_ID_LENGTH - ending.length).replace(/-$/, '')}${ending}`;
    suffix += 1;
  }
  return id;
}

export function editableCopy(board: RawBoard, existing: readonly RawBoard[]): RawBoard {
  const names = new Set(existing.map((item) => String(item.name).toLowerCase()));
  const base = String(board.name);
  let ending = COPY_SUFFIX;
  let name = `${base.slice(0, MAX_NAME_LENGTH - ending.length)}${ending}`;
  let suffix = 2;
  while (names.has(name.toLowerCase())) {
    ending = `${COPY_SUFFIX} ${suffix}`;
    name = `${base.slice(0, MAX_NAME_LENGTH - ending.length)}${ending}`;
    suffix += 1;
  }
  return { ...board, id: boardIdFromName(name, existing), name, description: `Custom board based on ${String(board.name)}` };
}
