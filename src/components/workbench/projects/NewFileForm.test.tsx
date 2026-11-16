// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { NewFileLanguage } from '../newFile';
import { NewFileForm } from './NewFileForm';

const ignore = () => undefined;

const render = (language: NewFileLanguage, suggestedName: string, existingNames: readonly string[] = []) =>
  renderToStaticMarkup(
    <NewFileForm language={language} suggestedName={suggestedName} existingNames={existingNames} busy={false} onCreate={ignore} onCancel={ignore} />,
  );

/** The visible text, without tags; the apostrophe is the one entity the form's text has. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('the inline new-file form', () => {
  test('names the VHDL form', () => {
    expect(textOf(render('vhdl', 'untitled1'))).toContain('Create VHDL file VHDL · .vhd');
  });

  test('names the Verilog form', () => {
    expect(textOf(render('verilog', 'counter'))).toContain('Create Verilog file Verilog · .v');
  });

  test('says what a VHDL name creates', () => {
    expect(textOf(render('vhdl', 'untitled1'))).toContain("Creates untitled1.vhd with an entity of the same name and the board's ports.");
  });

  test('says what a Verilog name creates', () => {
    expect(textOf(render('verilog', 'counter'))).toContain("Creates counter.v with a module of the same name and the board's ports.");
  });

  test('has no language choice', () => {
    expect(render('vhdl', 'untitled1')).not.toContain('type="radio"');
  });

  test('focuses the file name', () => {
    expect(render('vhdl', 'untitled1')).toMatch(/<input[^>]*autofocus/i);
  });

  test('says why a name already in Files cannot be used', () => {
    expect(render('verilog', 'counter', ['counter.v'])).toMatch(/role="alert"><span class="wb-newfile__error">[^<]+</);
  });

  test('marks the field of a name that cannot be used', () => {
    expect(render('vhdl', '2bad')).toContain('aria-invalid="true"');
  });

  test('offers Cancel before Create file', () => {
    expect(textOf(render('vhdl', 'untitled1'))).toMatch(/Cancel Create file\s*$/);
  });
});
