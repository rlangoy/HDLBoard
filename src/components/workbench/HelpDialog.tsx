// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { sevenSegmentHeading } from '../../boards/boardPorts';
import type { BoardDefinition } from '../../boards/types';
import { Dialog } from './Dialog';
import { CHEAT_SHEET, GUIDES, REFERENCES, type HelpResource } from './helpResources';
import { signalRows, usesActiveLowSuffix } from './helpSignals';
import './HelpDialog.css';

export interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  /** The active board: the signal table and the samples use its names. */
  board: BoardDefinition;
}

/** A book with a question mark, drawn to sit in the dialog's white badge. */
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6.9c0 1.9-2.8 2.4-2.8 4.1" />
      <circle cx="12" cy="17.4" r="0.6" fill="currentColor" />
    </svg>
  );
}

/**
 * The board's own segment numbering (bit 0 = top … bit 6 = middle), the
 * same as `SevenSegment/segments.ts`. Drawn small, so a reader can tie a
 * bit number to a segment at a glance.
 */
const SEGMENTS: { bit: number; x: number; y: number; w: number; h: number }[] = [
  { bit: 0, x: 24, y: 6, w: 72, h: 16 },
  { bit: 1, x: 98, y: 24, w: 16, h: 58 },
  { bit: 2, x: 98, y: 92, w: 16, h: 58 },
  { bit: 3, x: 24, y: 152, w: 72, h: 16 },
  { bit: 4, x: 6, y: 92, w: 16, h: 58 },
  { bit: 5, x: 6, y: 24, w: 16, h: 58 },
  { bit: 6, x: 24, y: 79, w: 72, h: 16 },
];

function SegmentFigure() {
  return (
    <svg
      className="wb-help__segfig"
      viewBox="0 0 120 174"
      role="img"
      aria-label="A 7-segment display with its segments numbered: 0 top, 1 top right, 2 bottom right, 3 bottom, 4 bottom left, 5 top left, 6 middle"
    >
      {SEGMENTS.map((s) => (
        <g key={s.bit}>
          <rect className="wb-help__seg" x={s.x} y={s.y} width={s.w} height={s.h} rx={6} />
          <text className="wb-help__segnum" x={s.x + s.w / 2} y={s.y + s.h / 2} textAnchor="middle" dominantBaseline="central">
            {s.bit}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** A whole-card link; the arrow after the title says it leaves the app. */
function ResourceLink({ resource, rank }: { resource: HelpResource; rank?: number }) {
  return (
    <li className="wb-help__item">
      <a className="wb-help__res" href={resource.url} target="_blank" rel="noopener noreferrer">
        {rank !== undefined && (
          <span className="wb-help__rank" aria-hidden="true">
            {rank}
          </span>
        )}
        <span className="wb-help__res-main">
          <span className="wb-help__res-title">{resource.title}</span>
          <span className="wb-help__res-meta">
            {resource.source} <span aria-hidden="true">&middot;</span> {resource.kind}
          </span>
          <span className="wb-help__res-text">{resource.description}</span>
        </span>
      </a>
    </li>
  );
}

/**
 * Help: first, what the board's signal names mean — the part that trips up
 * every newcomer (`KEY_N`, `HEXn`, `[3:0]`), in the active board's names — then a
 * short, curated list of places to learn VHDL. The links are data in `helpResources.ts`.
 */
export function HelpDialog({ open, onClose, board }: HelpDialogProps) {
  const { ports, labels } = board;
  const [firstDisplay] = ports.sevenSegment;
  const lastDisplay = ports.sevenSegment[ports.sevenSegment.length - 1];
  const displayPattern = sevenSegmentHeading(ports.sevenSegment).replace(/\[\d+:0\]$/, '');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Help"
      subtitle="Board signal names and where to learn VHDL"
      icon={<HelpIcon />}
    >
      {/* ---------------------------------------------- board signals */}
      <section aria-labelledby="wb-help-signals">
        <h3 id="wb-help-signals" className="wb-help__heading">
          The board&rsquo;s signal names
        </h3>
        <p className="wb-dialog__lead">
          Your top-level entity (VHDL) or module (Verilog), for example{' '}
          <code>DE1_SoC</code>, talks to the board through the ports below. They are the {board.name} board&rsquo;s names
          (Settings &rsaquo; Board). Declare only the ones you use &mdash;
          every port is optional &mdash; and remember that VHDL ignores case,
          so <code>{ports.leds.toLowerCase()}</code> and <code>{ports.leds}</code> are the same port (HDLBoard
          matches the names without regard to case for Verilog too).
        </p>

        <div className="wb-help__tablewrap">
          <table className="wb-help__table">
            <caption className="wb-help__sr">Ports of the top-level entity on the {board.name} board</caption>
            <thead>
              <tr>
                <th scope="col">Port</th>
                <th scope="col">Dir</th>
                <th scope="col">Shown as</th>
                <th scope="col">What it is</th>
              </tr>
            </thead>
            <tbody>
              {signalRows(board).map((s) => (
                <tr key={s.port}>
                  <th scope="row">
                    <code>{s.port}</code>
                  </th>
                  <td>
                    <span className={`wb-help__dir wb-help__dir--${s.dir}`}>{s.dir}</span>
                  </td>
                  <td>{s.panel}</td>
                  <td>{s.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="wb-help__subheading">Reading the names</h4>
        <dl className="wb-help__terms">
          {usesActiveLowSuffix(board) && (
            <div className="wb-help__term">
              <dt>
                <code>_N</code>
              </dt>
              <dd>
                <strong>Active low</strong> &mdash; N for &ldquo;negative&rdquo;. The signal is
                &ldquo;on&rdquo; when it is <code>&apos;0&apos;</code>. So a released <code>{ports.pushbuttons}</code>{' '}
                button reads <code>&apos;1&apos;</code> and a pressed one <code>&apos;0&apos;</code>, and{' '}
                <code>{firstDisplay} &lt;= (others =&gt; &apos;1&apos;)</code> turns a display off.
              </dd>
            </div>
          )}
          <div className="wb-help__term">
            <dt>
              <code>{displayPattern}</code>
            </dt>
            <dd>
              The <code>n</code> is the display number, 0 to 5. <code>{firstDisplay}</code> is the
              rightmost display and <code>{lastDisplay}</code> the leftmost. Each is its own 7-bit
              port &mdash; there is no single 42-bit vector. The keys and the displays are active low on every board:
              a pressed key reads <code>&apos;0&apos;</code>, and a <code>&apos;0&apos;</code> lights a segment.
            </dd>
          </div>
          <div className="wb-help__term">
            <dt>
              <code>[3:0]</code>
            </dt>
            <dd>
              The bit range, written <code>std_logic_vector(3 downto 0)</code> in VHDL. Bit 0 is the
              rightmost bit, and <code>{ports.pushbuttons}(0)</code> is <code>{labels.pushbuttons}0</code>. Likewise{' '}
              <code>[9:0]</code> is ten bits, <code>{ports.switches}(0)</code> to <code>{ports.switches}(9)</code>.
            </dd>
          </div>
          <div className="wb-help__term">
            <dt>
              <code>SW</code> <code>KEY</code> <code>LEDR</code>
            </dt>
            <dd>
              The board&rsquo;s silkscreen names: <b>SW</b>itches, <b>KEY</b>s (pushbuttons) and
              <b> LEDR</b>, the <b>R</b>ed LEDs.
            </dd>
          </div>
        </dl>

        <h4 className="wb-help__subheading">The seven bits of a display</h4>
        <div className="wb-help__seg-row">
          <SegmentFigure />
          <div className="wb-help__seg-text">
            <p>
              Each bit of <code>{displayPattern}</code> drives one segment. The numbering is the board&rsquo;s
              own, not the a&ndash;g letters: bit 0 is the top segment, then clockwise round to
              bit 5, and bit 6 is the middle bar. There is no decimal point.
            </p>
            <p>
              Because it is active low, a <code>&apos;0&apos;</code> lights a segment. To show a
              &ldquo;1&rdquo; you light segments 1 and 2 only, and write the word with bit 6 first:
            </p>
            <pre className="wb-help__code">{firstDisplay} &lt;= &quot;1111001&quot;;</pre>
          </div>
        </div>

        <div className="wb-dialog__callout wb-dialog__callout--info" role="note">
          <p className="wb-dialog__callout-title">Moving to the real board</p>
          <p>
            {usesActiveLowSuffix(board) && (
              <>
                On the physical DE1-SoC the pins are called plain <code>KEY</code> and <code>HEX0</code> to{' '}
                <code>HEX5</code>: the <code>_N</code> is a course convention, to make the polarity visible. Choose{' '}
                <strong>DE1-SoC</strong> in Settings &rsaquo; Board, and HDLBoard renames the ports for you.{' '}
              </>
            )}
            Before you synthesise, remove <code>{ports.clock500Hz}</code>, which exists only in the simulator.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ error markers */}
      <section aria-labelledby="wb-help-markers">
        <h3 id="wb-help-markers" className="wb-help__heading">
          Error markers
        </h3>
        <p className="wb-dialog__lead">
          Red and amber lines show where the compiler found a problem. In VHDL a wavy line marks the word GHDL points
          at, and where GHDL&apos;s words can mislead, the line says what the mistake probably is; hover the line
          number for GHDL&apos;s own text. Grey lines are probably caused by an earlier error. Click or type in the file
          to clear them; the full text stays in the console.
        </p>
      </section>

      {/* ------------------------------------------- learning resources */}
      <section aria-labelledby="wb-help-learn" className="wb-help__learn">
        <h3 id="wb-help-learn" className="wb-help__heading">
          Learn VHDL
        </h3>
        <p className="wb-dialog__lead">
          Free places to teach yourself the language. They open in your browser,
          and the numbered guides are listed best first.
        </p>

        <h4 className="wb-help__subheading">Cheat sheet</h4>
        <ul className="wb-help__list">
          <ResourceLink resource={CHEAT_SHEET} />
        </ul>

        <h4 className="wb-help__subheading">Guides and courses</h4>
        <ol className="wb-help__list">
          {GUIDES.map((g, i) => (
            <ResourceLink key={g.url} resource={g} rank={i + 1} />
          ))}
        </ol>

        <h4 className="wb-help__subheading">The board and the simulator</h4>
        <ul className="wb-help__list">
          {REFERENCES.map((r) => (
            <ResourceLink key={r.url} resource={r} />
          ))}
        </ul>
      </section>
    </Dialog>
  );
}

export default HelpDialog;
