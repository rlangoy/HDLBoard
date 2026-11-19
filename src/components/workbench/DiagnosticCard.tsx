// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { forwardRef, type CSSProperties, type PointerEventHandler } from 'react';
import { cx } from '../board';
import { CodeText } from './CodeText';
import { CopyCodeButton } from './CopyCodeButton';
import { textBlocks } from './diagnosticCardText';
import type { CardMessage } from './diagnosticText';
import './DiagnosticCard.css';

export interface DiagnosticCardProps {
  readonly line: number;
  /** The line's messages; empty for a line another message points at (a hint). */
  readonly messages: readonly CardMessage[];
  /** For a hint line: what the pointing message says, as plain text. */
  readonly note?: string;
  /** The plain text Copy puts on the clipboard (diagnosticCardText.ts `copyableText`). */
  readonly copyText: string;
  /** Opened by a click: it stays until Esc, a click elsewhere, or a scroll. */
  readonly pinned: boolean;
  readonly style: CSSProperties;
  readonly onPointerEnter: PointerEventHandler<HTMLDivElement>;
  readonly onPointerLeave: PointerEventHandler<HTMLDivElement>;
}

const SEVERITY_LABEL: Record<CardMessage['severity'], string> = { error: 'Error', warning: 'Warning' };

function Body({ text }: { text: string }) {
  return (
    <>
      {textBlocks(text).map((block, i) =>
        block.kind === 'code' ? (
          <pre className="wb-diagcard__code" key={i}>{block.lines.join('\n')}</pre>
        ) : (
          block.lines.map((line, j) => (
            <p className="wb-diagcard__text" key={`${i}-${j}`}>
              <CodeText text={line} />
            </p>
          ))
        ),
      )}
    </>
  );
}

/**
 * The problem card (docs/impl_sim_only_warnings.md § 5.2): what a marked line's
 * tooltip says, as a card the student can select text in and copy. It opens when the
 * pointer rests on the line number or its `!`, and stays pinned after a click there.
 */
export const DiagnosticCard = forwardRef<HTMLDivElement, DiagnosticCardProps>(function DiagnosticCard(
  { line, messages, note, copyText, pinned, style, onPointerEnter, onPointerLeave },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('wb-diagcard', pinned && 'is-pinned')}
      role="dialog"
      aria-label={`Problems on line ${line}`}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      // A click in the card is not a click in the code: it keeps the markers and the card.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="wb-diagcard__bar">
        <span className="wb-diagcard__where">Line {line}</span>
        <CopyCodeButton code={copyText} label="Copy this message" visibleLabel="Copy" />
      </div>
      <div className="wb-diagcard__scroll">
        {note !== undefined && <Body text={note} />}
        {messages.map((m, i) => (
          <section className={cx('wb-diagcard__message', `is-${m.severity}`)} key={i}>
            <p className="wb-diagcard__headline">
              <span className="wb-diagcard__severity">{SEVERITY_LABEL[m.severity]}</span>
              <CodeText text={m.headline} />
            </p>
            {m.body !== undefined && <Body text={m.body} />}
            {m.details.length > 0 && <pre className="wb-diagcard__code">{m.details.join('\n')}</pre>}
            {m.source !== undefined && <p className="wb-diagcard__source">{m.source}</p>}
          </section>
        ))}
      </div>
    </div>
  );
});
