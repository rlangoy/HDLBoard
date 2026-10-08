// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { gistDownloadUrl, gistRawUrl, isGistUrl, parseGistPageUrl, resolveProjectUrl } from './gistUrl';
import { directDownloadUrl } from './url';
import { fakeFetch, jsonResponse } from './testHelpers';

const GIST_ID = 'd0f81712e049eb0ffd53493f84e49c44';
const PAGE_URL = `https://gist.github.com/rlangoy/${GIST_ID}`;
const RAW_URL = `https://gist.githubusercontent.com/rlangoy/${GIST_ID}/raw`;
const API_URL = `https://api.github.com/gists/${GIST_ID}`;

describe('gist page URLs', () => {
  it('parses owner and id', () => {
    expect(parseGistPageUrl(PAGE_URL)).toEqual({ owner: 'rlangoy', gistId: GIST_ID });
    expect(parseGistPageUrl(`${PAGE_URL}/`)).toEqual({ owner: 'rlangoy', gistId: GIST_ID });
    expect(parseGistPageUrl(`${PAGE_URL}#file-adder4-vhd`)).toEqual({ owner: 'rlangoy', gistId: GIST_ID });
  });

  it('rejects other URLs', () => {
    expect(parseGistPageUrl('https://example.com/rlangoy/abc')).toBeNull();
    expect(parseGistPageUrl(RAW_URL)).toBeNull();
    expect(parseGistPageUrl(`https://gist.github.com/${GIST_ID}`)).toBeNull();
  });

  it('downloads a gist page from its raw address and leaves other URLs alone', () => {
    expect(gistDownloadUrl(PAGE_URL)).toBe(RAW_URL);
    expect(directDownloadUrl(PAGE_URL)).toBe(RAW_URL);
    expect(directDownloadUrl('https://example.com/a.vhd')).toBe('https://example.com/a.vhd');
  });

  it('builds raw URLs with an encoded file name', () => {
    expect(gistRawUrl({ owner: 'rlangoy', gistId: GIST_ID }, 'my file.vhd')).toBe(`${RAW_URL}/my%20file.vhd`);
  });

  it('recognises page and raw gist URLs', () => {
    expect(isGistUrl(PAGE_URL)).toBe(true);
    expect(isGistUrl(`${RAW_URL}/adder4.vhd`)).toBe(true);
    expect(isGistUrl('https://example.com/adder4.vhd')).toBe(false);
  });
});

describe('resolveProjectUrl', () => {
  it('points at the gist project file by name, found with the GitHub API', async () => {
    const { fetchFn } = fakeFetch({
      [`GET ${API_URL}`]: jsonResponse({ files: { 'adder-and-counter.hdlboard.json': {}, 'notes.md': {} } }),
    });
    expect(await resolveProjectUrl(PAGE_URL, fetchFn)).toBe(`${RAW_URL}/adder-and-counter.hdlboard.json`);
  });

  it('falls back to the raw gist URL when the API is rate limited', async () => {
    const { fetchFn } = fakeFetch({ [`GET ${API_URL}`]: jsonResponse({ message: 'API rate limit exceeded' }, 403) });
    expect(await resolveProjectUrl(PAGE_URL, fetchFn)).toBe(RAW_URL);
  });

  it('falls back to the raw gist URL when the gist has several project files', async () => {
    const { fetchFn } = fakeFetch({
      [`GET ${API_URL}`]: jsonResponse({ files: { 'a.hdlboard.json': {}, 'b.hdlboard.json': {} } }),
    });
    expect(await resolveProjectUrl(PAGE_URL, fetchFn)).toBe(RAW_URL);
  });

  it('returns other URLs unchanged without any request', async () => {
    const { fetchFn, requests } = fakeFetch({});
    expect(await resolveProjectUrl('https://example.com/p.hdlboard.json', fetchFn)).toBe('https://example.com/p.hdlboard.json');
    expect(requests).toHaveLength(0);
  });
});
