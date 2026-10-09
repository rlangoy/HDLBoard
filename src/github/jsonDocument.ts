// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Reading a small JSON document field by field, with a message that names the document and field. */

export type JsonRecord = Record<string, unknown>;

export class InvalidDocumentError extends Error {
  constructor(
    readonly sourceName: string,
    reason: string,
  ) {
    super(`${sourceName}: ${reason}`);
    this.name = 'InvalidDocumentError';
  }
}

export function parseJsonObject(text: string, sourceName: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidDocumentError(sourceName, 'is not valid JSON');
  }
  return asRecord(value, sourceName);
}

export function asRecord(value: unknown, sourceName: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidDocumentError(sourceName, 'must be a JSON object');
  }
  return value as JsonRecord;
}

export function readString(record: JsonRecord, field: string, sourceName: string): string {
  const value = record[field];
  if (typeof value !== 'string') throw new InvalidDocumentError(sourceName, `"${field}" must be a string`);
  return value;
}

export function readOptionalString(record: JsonRecord, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value : '';
}

export function readArray(record: JsonRecord, field: string, sourceName: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) throw new InvalidDocumentError(sourceName, `"${field}" must be an array`);
  return value;
}

export function requireVersion(record: JsonRecord, supportedVersion: number, sourceName: string): number {
  if (record.version !== supportedVersion) {
    throw new InvalidDocumentError(sourceName, `"version" must be ${supportedVersion}`);
  }
  return supportedVersion;
}

export function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
