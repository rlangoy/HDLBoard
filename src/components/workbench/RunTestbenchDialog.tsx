// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState } from 'react';
import { Dialog } from './Dialog';
import { FlaskIcon } from './icons';
import { RoleIcon } from './RoleIcon';
import type { TestbenchChoice } from './splitModel';
import { TEXT, noBoardPorts, runAnyway } from './testbenchText';
import './NewFileDialog.css';

export interface RunTestbenchDialogProps {
  /** The design file the student asked to run. */
  designName: string;
  /** Testbench units that instantiate it, best first (preselected). */
  choices: readonly TestbenchChoice[];
  onRunTestbench: (choice: TestbenchChoice) => void;
  onRunAnyway: () => void;
  onClose: () => void;
}

/**
 * A design without board ports that a testbench instantiates was run
 * (docs/impl_split_screen.md § 4.10): the board cannot drive it, so offer the
 * testbench units — file › unit, so a testbench in the same file is offered too.
 */
export function RunTestbenchDialog({ designName, choices, onRunTestbench, onRunAnyway, onClose }: RunTestbenchDialogProps) {
  const [chosen, setChosen] = useState(0);
  const formId = useId();
  const choice = choices[chosen];
  return (
    <Dialog
      open
      onClose={onClose}
      title={TEXT.runTestbench}
      subtitle={noBoardPorts(designName)}
      icon={<FlaskIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onClose}>
            {TEXT.cancel}
          </button>
          <button type="button" className="wb-newfile__cancel" onClick={onRunAnyway}>
            {runAnyway(designName)}
          </button>
          <button type="button" className="wb-dialog__close" autoFocus disabled={!choice} onClick={() => choice && onRunTestbench(choice)}>
            {TEXT.runTestbench}
          </button>
        </div>
      }
    >
      <fieldset className="wb-newfile__languages wb-runtb">
        <legend className="wb-newfile__label">{TEXT.runTestbenchQuestion}</legend>
        {choices.map((c, i) => (
          <label key={`${c.fileId}-${c.unitName}`} className="wb-newfile__radio">
            <input type="radio" name={`${formId}-tb`} checked={i === chosen} onChange={() => setChosen(i)} />
            <RoleIcon role={c.role} />
            {c.name} › {c.unitName}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
