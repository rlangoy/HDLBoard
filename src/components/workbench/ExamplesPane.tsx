// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../board';
import { BUILT_IN_BOARDS } from '../../boards/boardCatalog';
import { isDefaultShape } from '../../boards/shapeChange';
import type { BoardDefinition } from '../../boards/types';
import { BoardResourceLinks } from './BoardResourceLinks';
import { BOARD_TEXT, examplesNotice, ownExamplesNotice } from './boardText';
import { EXAMPLE_LANGUAGES, LANGUAGE_LABEL, examplesFor, filterExamples, hasExamples as boardHasExamples, type Example, type ExampleLanguage } from './examples';
import { AlertIcon, BookIcon, CloseIcon, FolderOpenIcon, InfoIcon, SearchIcon } from './icons';
import { simOnlyExamples, type SimOnlyReasons } from './simOnly/exampleCheck';
import type { DesignCheckMode } from './simOnly/types';
import type { PreferredLanguages } from './languagePrefs';
import { ScrollArea } from './ScrollArea';
import './ExamplesPane.css';

export interface ExamplesPaneProps {
  /**
   * The languages ticked when the pane opens: Settings › Languages. Ticking here
   * changes this visit's list only, never the setting.
   */
  initialLanguages: PreferredLanguages;
  /** Copy the example's files into the project and open the first one. */
  onOpen: (example: Example) => void;
  onClose: () => void;
  /** The active board: the examples are offered only on boards of the Default shape. */
  board: BoardDefinition;
  /** Add the board's generated starter top to the project (§ 5.4). */
  onNewStarterFile: () => void;
  /** Settings › Simulation › Design check: with *Simulation only*, no card is marked SIM-only. */
  designCheck: DesignCheckMode;
}

/**
 * "Available Examples": shown over the editor while open (the editor stays
 * mounted underneath, so its scroll position and undo history survive). Each card copies
 * its example into the Files panel; the built-in files are never edited.
 */
export function ExamplesPane({ initialLanguages, onOpen, onClose, board, onNewStarterFile, designCheck }: ExamplesPaneProps) {
  const [query, setQuery] = useState('');
  const [languages, setLanguages] = useState<ReadonlySet<ExampleLanguage>>(initialLanguages);
  const searchRef = useRef<HTMLInputElement>(null);
  const offered = useMemo(() => examplesFor(board), [board]);
  const shown = filterExamples(offered, query, languages, board);
  // What the editor's badge will say once a card is opened (docs/impl_sim_only_warnings.md § 5.3).
  const simOnly = useMemo(() => simOnlyExamples(offered, board, designCheck), [offered, board, designCheck]);
  // The examples are written for the Default shape and for the boards with files of their own; any other board gets a notice instead (§ 5.4).
  const hasExamples = boardHasExamples(board);

  useEffect(() => searchRef.current?.focus(), []);

  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onClose();
  };

  return (
    <section className="wb-examples" aria-labelledby="wb-examples-title" onKeyDown={closeOnEscape}>
      <ScrollArea className="wb-examples__scroll">
        <div className="wb-examples__inner">
          <header className="wb-examples__header">
            <BookIcon className="wb-examples__title-icon" aria-hidden="true" />
            <h2 id="wb-examples-title" className="wb-examples__title">
              Available Examples
            </h2>
            <button
              type="button"
              className="wb-examples__close"
              onClick={onClose}
              aria-label="Close examples"
              title="Close (Esc)"
            >
              <CloseIcon aria-hidden="true" />
            </button>
          </header>
          <p className="wb-examples__subtitle">Browse and open example designs to get started.</p>

          {hasExamples && (
            <label className="wb-examples__search">
              <SearchIcon className="wb-examples__search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search examples..."
                aria-label="Search examples"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}

          {hasExamples && <LanguageFilter languages={languages} onChange={setLanguages} />}

          {!hasExamples ? (
            <OtherShapeNotice board={board} onNewStarterFile={onNewStarterFile} />
          ) : shown.length === 0 ? (
            <p className="wb-examples__empty">{emptyMessage(languages, query)}</p>
          ) : (
            <ul className="wb-examples__grid">
              {shown.map((example) => (
                <ExampleCard key={example.id} example={example} simOnly={simOnly.get(example.id)} onOpen={onOpen} />
              ))}
            </ul>
          )}

          <p className="wb-examples__note">
            <InfoIcon className="wb-examples__note-icon" aria-hidden="true" />
            These examples are read-only. Opening one copies it into your Files, where you can edit it.
          </p>
        </div>
      </ScrollArea>
    </section>
  );
}

/** On a board of another shape: why there are no cards, a starter file instead, and the board's resources. */
function OtherShapeNotice({ board, onNewStarterFile }: { board: BoardDefinition; onNewStarterFile: () => void }) {
  return (
    <div className="wb-examples__shape" role="note">
      <p>{examplesNotice(BUILT_IN_BOARDS.filter((builtIn) => isDefaultShape(builtIn.ports)))}</p>
      <p>{ownExamplesNotice(BUILT_IN_BOARDS.filter((builtIn) => !isDefaultShape(builtIn.ports) && boardHasExamples(builtIn)))}</p>
      <p>
        <button type="button" className="wb-dialog__close" onClick={onNewStarterFile}>
          {BOARD_TEXT.newStarterFile}
        </button>{' '}
        {BOARD_TEXT.newStarterFileNote}
      </p>
      <BoardResourceLinks resources={board.resources} lead={BOARD_TEXT.boardResources} />
    </div>
  );
}

/** What the pane says when no card is left to show. */
function emptyMessage(languages: ReadonlySet<ExampleLanguage>, query: string): string {
  return languages.size === 0 ? 'Tick VHDL or Verilog to see the examples.' : `No examples match “${query.trim()}”.`;
}

interface LanguageFilterProps {
  languages: ReadonlySet<ExampleLanguage>;
  onChange: (languages: ReadonlySet<ExampleLanguage>) => void;
}

/** "Show [x] VHDL [x] Verilog": which languages' cards are listed. */
function LanguageFilter({ languages, onChange }: LanguageFilterProps) {
  const toggle = (language: ExampleLanguage) => {
    const next = new Set(languages);
    if (next.has(language)) next.delete(language);
    else next.add(language);
    onChange(next);
  };

  return (
    <fieldset className="wb-examples__languages">
      <legend className="wb-examples__languages-legend">Show</legend>
      {EXAMPLE_LANGUAGES.map((language) => (
        <label key={language} className={cx('wb-examples__language', `is-${language}`)}>
          <input type="checkbox" checked={languages.has(language)} onChange={() => toggle(language)} />
          {LANGUAGE_LABEL[language]}
        </label>
      ))}
    </fieldset>
  );
}

interface ExampleCardProps {
  example: Example;
  /** Why the example only works in the simulator; absent when it runs on the board. */
  simOnly?: SimOnlyReasons;
  onOpen: (example: Example) => void;
}

/** The tooltip of a card's SIM-only badge: the lesson of an example SIM-only on purpose, else what makes it so. */
function simOnlyTitle(example: Example, reasons: SimOnlyReasons): string {
  return example.lesson ?? `Runs in the simulator, not on the board (${reasons.join(', ')}): the design check marks it SIM-only.`;
}

/** One example: its role dot, title, description, language and SIM-only badges, and Open button. */
function ExampleCard({ example, simOnly, onOpen }: ExampleCardProps) {
  const language = LANGUAGE_LABEL[example.language];
  return (
    <li className="wb-examples__card">
      <h3 className="wb-examples__card-title">
        <span className={cx('wb-examples__dot', `is-${example.role}`)} aria-hidden="true" />
        {example.title}
      </h3>
      <p className="wb-examples__card-text">{example.description}</p>
      {example.lesson && (
        <p className="wb-examples__lesson">
          <AlertIcon className="wb-examples__lesson-icon" aria-hidden="true" />
          {example.lesson}
        </p>
      )}
      <div className="wb-examples__badges">
        <span className={cx('wb-examples__badge', `is-${example.language}`)}>{language}</span>
        {simOnly && (
          <span className="wb-examples__simonly" title={simOnlyTitle(example, simOnly)}>
            <AlertIcon aria-hidden="true" />
            SIM-only
          </span>
        )}
      </div>
      <button
        type="button"
        className="wb-examples__open"
        onClick={() => onOpen(example)}
        aria-label={`Open ${example.title} (${language}${simOnly ? ', SIM-only' : ''})`}
      >
        <FolderOpenIcon aria-hidden="true" />
        Open
      </button>
    </li>
  );
}

export default ExamplesPane;
