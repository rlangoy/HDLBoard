// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { BoardDefinition, ButtonGroup, PortGroup } from './types';
import { buttonCount, displayCount } from './boardShape';

function groupSettings(group: PortGroup) {
  return group.kind === 'vector' ? { port: group.port, count: group.count } : { ports: group.ports };
}

function buttonSettings(buttons: ButtonGroup) {
  const { group, activeLow } = buttons;
  if (buttons.layout === 'cross' && group.kind === 'scalars') {
    const [centre, up, left, right, down] = group.ports;
    return { cross: { centre, up, left, right, down }, activeLow };
  }
  return { ...groupSettings(group), activeLow };
}

/** The version-2 file vocabulary, including resolved defaults, without runtime metadata. */
export function boardImportSettings(board: BoardDefinition) {
  const { ports } = board;
  const display = ports.sevenSegment;
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    ports: {
      clock: ports.clock.port,
      clockMHz: ports.clock.mhz,
      clock500Hz: ports.clock500Hz,
      ...(ports.switches.count ? { switches: ports.switches } : {}),
      ...(buttonCount(ports) ? { pushbuttons: buttonSettings(ports.pushbuttons) } : {}),
      ...(ports.resetButton ? { resetButton: ports.resetButton } : {}),
      leds: ports.leds,
      ...(displayCount(ports) ? { sevenSegment: display.kind === 'independent' ? display : {
        kind: display.kind,
        segments: display.segments.kind === 'vector' ? display.segments.port : display.segments.ports,
        ...(display.decimalPoint ? { decimalPoint: display.decimalPoint } : {}),
        digitEnables: display.digitEnables,
        digits: display.digits,
        activeLow: display.activeLow,
        digitEnablesActiveLow: display.digitEnablesActiveLow,
      } } : {}),
    },
    labels: board.labels,
    resources: board.resources,
  };
}
