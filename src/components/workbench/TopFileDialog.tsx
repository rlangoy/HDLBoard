// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { Dialog } from './Dialog';
import { ChipIcon } from './icons';
import {
  TOP_FILE_TEXT, looksLikeTheTop, makeTopAndStart, makeTopTitle, startAsItIs, whatStartRunsNow, whatTheTopFileIs,
} from './topFileText';
import type { TopFileSuggestion } from './topFileSuggestion';
import './TopFileDialog.css';

export interface TopFileDialogProps {
  suggestion: TopFileSuggestion;
  /** The file Start runs as things are; null when no file is the Top-File. */
  topFileName: string | null;
  onMakeTopAndStart: () => void;
  onStartAsItIs: () => void;
  /** *Don't ask me again* was ticked when a Start button was pressed. */
  onStopAsking: () => void;
  /** Cancel, Escape or the backdrop: nothing runs. */
  onClose: () => void;
}

/**
 * Start was pressed while the file on screen looks like the Top-File and another one
 * (or none) is it (topFileSuggestion.ts). The likely wish, making it top, is the
 * default button; either Start button applies *Don't ask me again*, Cancel does not.
 */
export function TopFileDialog(props: TopFileDialogProps) {
  const { suggestion, topFileName, onMakeTopAndStart, onStartAsItIs, onStopAsking, onClose } = props;
  const [stopAsking, setStopAsking] = useState(false);
  const thenStart = (start: () => void) => () => {
    if (stopAsking) onStopAsking();
    start();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={makeTopTitle(suggestion.label)}
      icon={<ChipIcon />}
      footer={
        <div className="wb-dialog__actions">
          <button type="button" className="wb-dialog__secondary" onClick={onClose}>
            {TOP_FILE_TEXT.cancel}
          </button>
          <button type="button" className="wb-dialog__secondary" onClick={thenStart(onStartAsItIs)}>
            {startAsItIs(topFileName)}
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={thenStart(onMakeTopAndStart)}>
            {makeTopAndStart(suggestion.label)}
          </button>
        </div>
      }
    >
      <div className="wb-topfile">
        <Explanation suggestion={suggestion} topFileName={topFileName} />
        <StopAskingBox checked={stopAsking} onChange={setStopAsking} />
      </div>
    </Dialog>
  );
}

function Explanation({ suggestion, topFileName }: Pick<TopFileDialogProps, 'suggestion' | 'topFileName'>) {
  return (
    <>
      <p>{whatTheTopFileIs(suggestion)}</p>
      <p>
        {looksLikeTheTop(suggestion)} {whatStartRunsNow(topFileName)}
      </p>
      <div className="wb-dialog__callout wb-dialog__callout--info">
        <p>{TOP_FILE_TEXT.whereToChangeIt}</p>
      </div>
    </>
  );
}

function StopAskingBox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="wb-topfile__stop">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {TOP_FILE_TEXT.dontAskAgain}
        <span className="wb-topfile__note">{TOP_FILE_TEXT.turnBackOn}</span>
      </span>
    </label>
  );
}
