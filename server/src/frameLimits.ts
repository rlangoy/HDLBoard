// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The sizes of WebSocket frames the protocol relies on, for every module that bounds them. */

/**
 * The largest frame a client may send: a RUN with every source of a project. Far above
 * any course project, far below ws's default of 100 MiB, which one tab could make the
 * backend buffer.
 */
export const MAX_CLIENT_FRAME_BYTES = 8_388_608; // 8 MiB

/** The largest binary frame of a waveform, 1 MiB (docs/waveform_viewer_spec.md § 7.4). */
export const MAX_BINARY_FRAME_BYTES = 1_048_576;

/** RFC 6455's largest frame header: 2 bytes, an 8-byte length, a 4-byte mask. */
export const MAX_FRAME_HEADER_BYTES = 14;
