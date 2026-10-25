// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A board's `resources`: links to its design resources (docs/board_io_v2_spec.md D8,
 * F9). They come from a file the user edits and are shown as links in the app's own
 * origin, so only `https://` addresses get through — never `javascript:` or `data:`.
 */

import { fail, objectAt, quoted } from './boardFileReader';
import { MAX_RESOURCE_LABEL_LENGTH, MAX_RESOURCE_URL_LENGTH, MAX_RESOURCES } from './boardLimits';
import type { BoardResource } from './types';

const RESOURCE_FIELDS = { required: ['label', 'url'] } as const;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const WHITESPACE = /\s/;

export function readResources(value: unknown): BoardResource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_RESOURCES) fail(`resources must be an array of at most ${MAX_RESOURCES} links`);
  const resources = value.map((entry, index) => readResource(`resources[${index}]`, entry));
  checkLabelsUnique(resources);
  return resources;
}

function readResource(path: string, value: unknown): BoardResource {
  const resource = objectAt(path, value, RESOURCE_FIELDS);
  return { label: readLabel(`${path}.label`, resource.label), url: readUrl(`${path}.url`, resource.url) };
}

function readLabel(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RESOURCE_LABEL_LENGTH) {
    fail(`${path} must be text of 1 to ${MAX_RESOURCE_LABEL_LENGTH} characters`);
  }
  if (CONTROL_CHARACTER.test(value)) fail(`${path} ${quoted(value)} has a control character`);
  return value;
}

function readUrl(path: string, value: unknown): string {
  if (typeof value !== 'string') fail(`${path} must be a string`);
  if (value.length > MAX_RESOURCE_URL_LENGTH) fail(`${path} is longer than ${MAX_RESOURCE_URL_LENGTH} characters`);
  if (!isHttpsUrl(value)) fail(`${path} ${quoted(value)} must be an https:// address`);
  return value;
}

export function isHttpsUrl(text: string): boolean {
  // Never part of an address HDLBoard shows, though `new URL` would quietly drop some.
  if (WHITESPACE.test(text) || CONTROL_CHARACTER.test(text)) return false;
  try {
    return new URL(text).protocol === 'https:';
  } catch {
    return false;
  }
}

function checkLabelsUnique(resources: readonly BoardResource[]): void {
  const repeated = resources.find((resource, index) => resources.findIndex((other) => other.label === resource.label) !== index);
  if (repeated !== undefined) fail(`resources: the label ${quoted(repeated.label)} is used twice`);
}
