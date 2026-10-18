// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/*
 * Material Symbols Outlined – "do_not_disturb_on", "add_circle", "zoom_out_map",
 * "more_horiz" and "close", wght 400 / GRAD 0 / opsz 24 / FILL 0 – for the waveform
 * toolbar (docs/images/head_moc1.png). Inlined as plain SVG like the rest of the app's
 * icons (workbench/icons.tsx); `fill="currentColor"` takes the button's colour.
 */

import type { SVGProps } from 'react';

const CIRCLE =
  'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z';

function Icon({ d, ...props }: SVGProps<SVGSVGElement> & { readonly d: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" aria-hidden="true" {...props}>
      <path d={d} />
    </svg>
  );
}

export const ZoomOutIcon = (props: SVGProps<SVGSVGElement>) => <Icon d={`M280-440h400v-80H280v80Z${CIRCLE}`} {...props} />;

export const ZoomInIcon = (props: SVGProps<SVGSVGElement>) => <Icon d={`M440-280h80v-160h160v-80H520v-160h-80v160H280v80h160v160Z${CIRCLE}`} {...props} />;

export const FitIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon
    d="M120-120v-240h80v104l124-124 56 56-124 124h104v80H120Zm480 0v-80h104L580-324l56-56 124 124v-104h80v240H600ZM324-580 200-704v104h-80v-240h240v80H256l124 124-56 56Zm312 0-56-56 124-124H600v-80h240v240h-80v-104L636-580Z"
    {...props}
  />
);

export const MoreIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon
    d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"
    {...props}
  />
);

/** A plain X: the close button's circle is its background, as in the mockup. */
export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" {...props} />
);
