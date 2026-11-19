// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { DiagnosticCard } from './DiagnosticCard';
import type { CardMessage } from './diagnosticText';

const ignore = () => undefined;
const WARNING: CardMessage = {
  severity: 'warning',
  headline: '`count` uses two clocks: a register allows one clock edge.',
  source: 'HDLBoard design check',
  body: "Allowed:\n  if rst = '0' then\nHere: second clock → error.",
  details: [],
};
const render = (pinned = false) =>
  renderToStaticMarkup(
    <DiagnosticCard line={23} messages={[WARNING]} copyText="x" pinned={pinned} style={{ top: 10, left: 50 }} onPointerEnter={ignore} onPointerLeave={ignore} />,
  );

describe('the problem card', () => {
  test('names the line and offers Copy', () => {
    const html = render();
    expect(html).toContain('Line 23');
    expect(html).toContain('aria-label="Copy this message"');
    expect(html).toContain('aria-label="Problems on line 23"');
  });

  test('shows the severity, the headline with code, the code block and who says it', () => {
    const html = render();
    expect(html).toContain('>Warning<');
    expect(html).toContain('<code>count</code> uses two clocks');
    expect(html).toContain('<pre class="wb-diagcard__code">if rst = &#x27;0&#x27; then</pre>');
    expect(html).toContain('HDLBoard design check');
  });

  test('a pinned card looks pinned', () => {
    expect(render(true)).toContain('wb-diagcard is-pinned');
  });
});
