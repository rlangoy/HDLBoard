// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Board pane's state for the active board (docs/board_io_v2_spec.md § 5.1, § 6.2):
 * what the student sets (inputs) and what the design drives (outputs), sized and
 * polarised by the board. The HdlClient's handlers are made once, so everything they
 * call reads the board and the inputs through refs and never goes stale.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeState,
  encodeStim,
  outputsOff,
  restInputs,
  sameInputShape,
  type BoardInputs,
  type BoardOutputs,
} from '../../boards/boardShape';
import type { BoardDefinition } from '../../boards/types';

export interface BoardIo {
  readonly inputs: BoardInputs;
  readonly outputs: BoardOutputs;
  /** The latest inputs, which may be newer than the last render's. */
  latestInputs(): BoardInputs;
  /** Merges `changed` into the latest inputs (not the last render's) and returns the result. */
  setInputs(changed: Partial<BoardInputs>): BoardInputs;
  /** The `STIM` payload for the inputs as they are now. */
  stimBits(): string;
  /** A `STATE` payload, shown on the board; a payload of the wrong length is dropped. */
  showState(bits: string): void;
  /** Nothing is simulating: every output off. Also starts a new run's single drop warning. */
  blank(): void;
}

export function useBoardIo(board: BoardDefinition): BoardIo {
  const boardRef = useRef(board);
  boardRef.current = board;
  const [inputs, setInputsState] = useState(() => restInputs(board.ports));
  const inputsRef = useRef(inputs);
  const [outputs, setOutputs] = useState(() => outputsOff(board.ports));
  const warnedAboutDrop = useRef(false);

  // Merged into the ref, not the rendered state: a switch flip and a key press before the
  // next render must not undo each other.
  const setInputs = useCallback((changed: Partial<BoardInputs>) => {
    const next = { ...inputsRef.current, ...changed };
    inputsRef.current = next;
    setInputsState(next);
    return next;
  }, []);

  // Another board: inputs kept when they mean the same there (Default ↔ DE1-SoC), else at rest.
  const shownBoard = useRef(board);
  useEffect(() => {
    const previous = shownBoard.current;
    shownBoard.current = board;
    if (previous === board) return;
    if (!sameInputShape(previous.ports, board.ports)) setInputs(restInputs(board.ports));
    setOutputs(outputsOff(board.ports));
  }, [board, setInputs]);

  const latestInputs = useCallback(() => inputsRef.current, []);

  const stimBits = useCallback(() => encodeStim(boardRef.current.ports, inputsRef.current), []);

  const showState = useCallback((bits: string) => {
    const decoded = decodeState(boardRef.current.ports, bits);
    if (decoded !== undefined) {
      setOutputs(decoded);
    } else if (!warnedAboutDrop.current) {
      // Normal for a moment after a board change; the developer console, not the student's.
      warnedAboutDrop.current = true;
      console.warn(`HDLBoard: dropped a STATE of ${bits.length} bits, which does not fit the ${boardRef.current.name} board.`);
    }
  }, []);

  const blank = useCallback(() => {
    warnedAboutDrop.current = false;
    setOutputs(outputsOff(boardRef.current.ports));
  }, []);

  return { inputs, outputs, latestInputs, setInputs, stimBits, showState, blank };
}
