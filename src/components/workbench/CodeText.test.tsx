// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CodeText } from './CodeText';

test('each part in backticks is drawn in code font, without the backticks', () => {
  const html = renderToStaticMarkup(<CodeText text="Extra `end` — delete `end architecture;`." />);
  expect(html).toBe('Extra <code>end</code> — delete <code>end architecture;</code>.');
});
