// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import {
  Switches,
  ToggleSwitch,
  bitsToNumber,
  bitsToString,
  numberToBits,
  type BitVector,
} from './components/Switches';
import { Led, Leds } from './components/Leds';
import { Pushbutton, Pushbuttons } from './components/Pushbuttons';
import {
  SevenSegmentDisplay,
  SevenSegmentDisplays,
  nibbleToSegments,
  numberToDisplays,
  patternToSegments,
} from './components/SevenSegment';
import { Board } from './components/board';

/**
 * Every board component, every state, side by side with what the
 * Design_Description.md § 7 workflow screenshots against the reference
 * renders. Not the app's main page (that's `Workbench`, § the
 * DesignResources/WorkBench.png mock) — reachable at the `#gallery`
 * hash so it stays a real, used page rather than dead code.
 */
export default function ComponentGallery() {
  // Controlled bank — this is the shape a VHDL simulator would drive.
  const [sw, setSw] = useState<BitVector>(() => numberToBits(0b0000110101, 10));
  const [single, setSingle] = useState(false);
  // KEY is active low, so it rests at all ones.
  const [key, setKey] = useState<BitVector>(() => [1, 1, 1, 1]);

  const dec = bitsToNumber(sw);

  return (
    <div className="demo">
      <h1 className="demo__h1">PB1180 UI — board components</h1>
      <p className="demo__lead">
        <code>SW[9:0]</code>, <code>LEDR[9:0]</code> and <code>KEY_N[3:0]</code>, drawn{' '}
        to match{' '}
        <code>DesignResources/</code>. Pure CSS — no images, no SVG. Click a
        switch, or tab to one and press <kbd>Space</kbd>.
      </p>

      <section className="demo__section">
        <h2 className="demo__h2">The whole board</h2>
        <p className="demo__note">
          The 2×2 arrangement from <code>Component_grouping.png</code>: outputs
          on top, inputs underneath. One piece of state drives it —{' '}
          <code>LEDR &lt;= SW</code>, and <code>SW</code> split into nibbles
          through the <code>hex7seg</code> table for <code>HEX</code>. Flip a
          switch and watch all three outputs follow.
        </p>
        <Board>
          <Leds value={sw} />
          <SevenSegmentDisplays value={numberToDisplays(dec, 6)} />
          <Switches value={sw} onChange={setSw} />
          <Pushbuttons value={key} onChange={setKey} />
        </Board>
        <dl className="demo__values">
          <dt>SW</dt>
          <dd>{bitsToString(sw)}</dd>
          <dt>hex</dt>
          <dd>0x{dec.toString(16).toUpperCase().padStart(3, '0')}</dd>
          <dt>KEY</dt>
          <dd>{bitsToString(key)}</dd>
        </dl>
        <p className="demo__note">
          <code>&lt;Board&gt;</code> is only the grid — it holds no state and
          knows nothing about what is in it. What makes the columns line up is
          that every panel already shares one scale unit and one part band.
        </p>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">
          Switches driving LEDs — <code>LEDR &lt;= SW;</code>
        </h2>
        <div className="demo__stack">
          <Switches value={sw} onChange={setSw} />
          <Leds value={sw} />
        </div>
        <dl className="demo__values">
          <dt>bin</dt>
          <dd>{bitsToString(sw)}</dd>
          <dt>hex</dt>
          <dd>0x{dec.toString(16).toUpperCase().padStart(3, '0')}</dd>
          <dt>dec</dt>
          <dd>{dec}</dd>
        </dl>
        <p className="demo__note">
          Both panels share one scale unit and one column pitch, so bit{' '}
          <em>n</em> lines up vertically across the whole board.
        </p>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">LED states</h2>
        <p className="demo__note">
          Unlit is the reference render exactly: grey lens inside a light
          plastic rim and a dark outer ring. Lit is a saturated red with a hot
          core just above centre and a halo spilling onto the card.
        </p>
        <div className="demo__row">
          <Leds count={4} title="All off" defaultValue={[0, 0, 0, 0]} />
          <Leds count={4} title="All on" defaultValue={[1, 1, 1, 1]} />
          <Leds
            count={4}
            title="Click to toggle"
            defaultValue={[1, 0, 1, 0]}
            interactive
          />
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">
          7-segment displays — segments in, not a number
        </h2>
        <p className="demo__note">
          <code>value</code> is one 7-bit segment word per display, active low,
          indexed the way <code>HEX0[n]</code> is. Feed it a decoder's output
          and a wrong table <em>looks</em> wrong — which is the point of having
          it in the course.
        </p>
        <div className="demo__stack">
          <SevenSegmentDisplays value={numberToDisplays(dec, 6)} />
          <p className="demo__note">
            Driven by the switches above: <code>SW</code> = {dec}, split into
            nibbles and run through the course's <code>hex7seg</code> table.
          </p>
          <SevenSegmentDisplays
            title="All segments lit (HEX = 0x00)"
            count={6}
            value={Array.from({ length: 6 }, () => patternToSegments('0000000'))}
          />
          <p className="demo__note">
            The reference render, reproduced: every segment on, which is what
            active-low <code>0x00</code> means.
          </p>
        </div>
        <p className="demo__note">
          The whole decoder table, 0 through F. Note <code>9</code>: the
          course's table leaves the bottom segment dark — the open-tail nine.
        </p>
        <div className="demo__row demo__hexrow">
          {Array.from({ length: 16 }, (_, n) => (
            <div className="demo__pair" key={n}>
              <SevenSegmentDisplay
                segments={nibbleToSegments(n)}
                size={30}
                label={`digit ${n.toString(16)}`}
              />
              <span className="demo__caption">
                {n.toString(16).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">Pushbuttons — active low, momentary</h2>
        <p className="demo__note">
          <code>value</code> is the <code>KEY</code> signal itself, not the
          pressed state: <code>1111</code> at rest, <code>0</code> on the button
          being held. Press and hold one — it springs back on release, like the
          real part. Hover, press, and press-while-hovering are the four states
          from <code>PushButtonStates.png</code>.
        </p>
        <div className="demo__row">
          <Pushbuttons value={key} onChange={setKey} />
          <dl className="demo__values">
            <dt>KEY</dt>
            <dd>{bitsToString(key)}</dd>
            <dt>held</dt>
            <dd>
              {key.every((b) => b === 1)
                ? 'none'
                : key
                    .map((b, i) => (b === 0 ? `KEY${i}` : null))
                    .filter(Boolean)
                    .reverse()
                    .join(', ')}
            </dd>
          </dl>
        </div>
        <div className="demo__row">
          <Pushbuttons
            title="Latching (momentary=false)"
            momentary={false}
            defaultValue={[1, 0, 1, 1]}
          />
          <Pushbuttons title="Disabled" disabled defaultValue={[1, 1, 0, 1]} />
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">Die colours</h2>
        <p className="demo__note">
          <code>color=&quot;red&quot;</code> is the DE-board <code>LEDR</code>{' '}
          bank; green and amber are there for boards that have them.
        </p>
        <div className="demo__row demo__leds">
          {(['red', 'green', 'amber'] as const).map((c) => (
            <div className="demo__pair" key={c}>
              <Led on={false} color={c} size={64} label={`${c} off`} />
              <Led on color={c} size={64} label={`${c} on`} />
              <span className="demo__caption">{c}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">Both switch positions</h2>
        <p className="demo__note">
          The knob travels the length of the slot — top for <code>1</code>,
          foot for <code>0</code> — and nothing changes colour. Drawn to{' '}
          <code>Switches_v2.png</code>.
        </p>
        <div className="demo__row">
          <Switches count={4} title="All off" defaultValue={[0, 0, 0, 0]} />
          <Switches count={4} title="All on" defaultValue={[1, 1, 1, 1]} />
          <Switches
            count={4}
            title="Disabled"
            defaultValue={[1, 0, 1, 0]}
            disabled
          />
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">One scale knob</h2>
        <p className="demo__note">
          Every length is a ratio of <code>--pb-unit</code>, so the{' '}
          <code>size</code> prop rescales parts, labels, padding and readout
          together.
        </p>
        <div className="demo__row demo__row--bottom">
          <Leds count={8} size={22} defaultValue={numberToBits(0xa5, 8)} />
          <Leds count={8} size={29} defaultValue={numberToBits(0xa5, 8)} />
        </div>
        <p className="demo__note">
          <code>size=22</code> · <code>size=29</code> (1:1 with the reference
          PNGs)
        </p>
      </section>

      <section className="demo__section">
        <h2 className="demo__h2">Bare parts, no card</h2>
        <div className="demo__row demo__row--bottom">
          <ToggleSwitch
            label="Single switch"
            checked={single}
            onChange={setSingle}
            size={80}
          />
          <Led on={single} size={80} label="Driven LED" />
          <Pushbutton
            label="Bare pushbutton"
            pressed={!single}
            onPressedChange={(p) => setSingle(!p)}
            size={80}
          />
          <p className="demo__note">
            <code>&lt;ToggleSwitch&gt;</code> driving a bare{' '}
            <code>&lt;Led&gt;</code>, and a bare{' '}
            <code>&lt;Pushbutton&gt;</code> driving the same state — currently{' '}
            <code>{single ? '1' : '0'}</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
