// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState } from 'react';
import { cx } from '../board';
import { EXAMPLES, EXAMPLE_LANGUAGES, LANGUAGE_LABEL, filterExamples, type Example, type ExampleLanguage } from './examples';
import { BookIcon, CloseIcon, FolderOpenIcon, InfoIcon, SearchIcon } from './icons';
import { ScrollArea } from './ScrollArea';
import './ExamplesPane.css';

export interface ExamplesPaneProps {
  /** Copy the example's files into the project and open the first one. */
  onOpen: (example: Example) => void;
  onClose: () => void;
}

/**
 * "Available Examples": shown over the editor while open (the editor stays
 * mounted underneath, so its tabs and undo history survive). Each card copies
 * its example into the Files panel; the built-in files are never edited.
 */
export function ExamplesPane({ onOpen, onClose }: ExamplesPaneProps) {
  const [query, setQuery] = useState('');
  const [languages, setLanguages] = useState<ReadonlySet<ExampleLanguage>>(() => new Set(EXAMPLE_LANGUAGES));
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = filterExamples(EXAMPLES, query, languages);

  const toggleLanguage = (language: ExampleLanguage) =>
    setLanguages((prev) => {
      const next = new Set(prev);
      if (!next.delete(language)) next.add(language);
      return next;
    });

  useEffect(() => searchRef.current?.focus(), []);

  return (
    <section
      className="wb-examples"
      aria-labelledby="wb-examples-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
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

          <fieldset className="wb-examples__languages">
            <legend className="wb-examples__languages-legend">Show</legend>
            {EXAMPLE_LANGUAGES.map((language) => (
              <label key={language} className={cx('wb-examples__language', `is-${language}`)}>
                <input
                  type="checkbox"
                  checked={languages.has(language)}
                  onChange={() => toggleLanguage(language)}
                />
                {LANGUAGE_LABEL[language]}
              </label>
            ))}
          </fieldset>

          {shown.length === 0 ? (
            <p className="wb-examples__empty">
              {languages.size === 0
                ? 'Tick VHDL or Verilog to see the examples.'
                : `No examples match “${query.trim()}”.`}
            </p>
          ) : (
            <ul className="wb-examples__grid">
              {shown.map((example) => (
                <li key={example.id} className="wb-examples__card">
                  <h3 className="wb-examples__card-title">
                    <span className={cx('wb-examples__dot', `is-${example.role}`)} aria-hidden="true" />
                    {example.title}
                  </h3>
                  <p className="wb-examples__card-text">{example.description}</p>
                  <span className={cx('wb-examples__badge', `is-${example.language}`)}>
                    {LANGUAGE_LABEL[example.language]}
                  </span>
                  <button
                    type="button"
                    className="wb-examples__open"
                    onClick={() => onOpen(example)}
                    aria-label={`Open ${example.title} (${LANGUAGE_LABEL[example.language]})`}
                  >
                    <FolderOpenIcon aria-hidden="true" />
                    Open
                  </button>
                </li>
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

export default ExamplesPane;
