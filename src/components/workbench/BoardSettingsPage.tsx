// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState } from 'react';
import type { BoardDefinition } from '../../boards/types';
import { boardImportSettings } from '../../boards/boardImportSettings';
import { CloseButton } from './CloseButton';
import { ScrollArea } from './ScrollArea';
import { CodeIcon } from './icons';
import './ProjectPage.css';
import './BoardSettingsPage.css';

interface BoardSettingsPageProps {
  board: BoardDefinition;
  requestedBoardId: string;
  onClose: () => void;
}

function BoardOverview({ board }: { board: BoardDefinition }) {
  return (
    <section className="wb-project__card" aria-label="Board overview">
      <dl className="wb-board-settings__overview">
        <dt>Clock</dt><dd>{board.ports.clock.mhz} MHz</dd>
        <dt>Switches</dt><dd>{board.ports.switches.count}</dd>
        <dt>LEDs</dt><dd>{board.ports.leds.count}</dd>
        <dt>Display</dt><dd>{board.ports.sevenSegment.kind === 'independent' ? `${board.ports.sevenSegment.ports.length} independent digits` : `${board.ports.sevenSegment.digits} multiplexed digits`}</dd>
      </dl>
      <p>Use Advanced to view the read-only board JSON. Editing and importing will be added later.</p>
    </section>
  );
}

function AdvancedButton({ expanded, controls, onClick }: { expanded: boolean; controls: string; onClick: () => void }) {
  return (
    <button type="button" className="wb-board-settings__advanced" aria-expanded={expanded}
      aria-controls={controls} title="Show or hide the board JSON" onClick={onClick}>
      <CodeIcon aria-hidden="true" />
      Advanced
    </button>
  );
}

export function BoardSettingsPage({ board, requestedBoardId, onClose }: BoardSettingsPageProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const parametersId = useId();
  useEffect(() => { sectionRef.current?.focus(); }, []);
  const settings = { version: 2, boards: [boardImportSettings(board)] };
  return (
    <section className="wb-project" ref={sectionRef} tabIndex={-1} aria-label="Board settings"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}>
      <ScrollArea className="wb-project__scroll">
        <div className="wb-project__inner">
          <header className="wb-project__card wb-board-settings__header">
            <div>
              <h2>Board settings: {board.name}</h2>
              <p>{board.description}</p>
            </div>
            <div className="wb-board-settings__actions">
              <AdvancedButton expanded={advanced} controls={parametersId} onClick={() => setAdvanced((shown) => !shown)} />
              <CloseButton label="Close board settings" hint="Back to the code (Esc)" onClick={onClose} />
            </div>
          </header>
          {requestedBoardId !== board.id && (
            <p className="wb-project__card" role="note">Board &ldquo;{requestedBoardId}&rdquo; is not installed. Showing the active fallback board, {board.name}.</p>
          )}
          <BoardOverview board={board} />
          <section id={parametersId} className="wb-project__card" aria-label="Board import parameters" hidden={!advanced}>
            <p>All effective defaults are included. Cross positions are named; display and scalar port arrays start at bit or digit 0. Segment arrays follow a through g.</p>
            <pre className="wb-board-settings__parameters"><code>{JSON.stringify(settings, null, 2)}</code></pre>
          </section>
        </div>
      </ScrollArea>
    </section>
  );
}
