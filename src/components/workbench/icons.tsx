// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SVGProps } from 'react';

/*
 * Material Symbols Outlined — "edit", "delete" and "download", wght 400 / GRAD 0 /
 * opsz 24 / FILL 0 (Google's default web variant), inlined as plain SVG
 * rather than pulled in as an icon font: this project runs fully local,
 * with no runtime dependency beyond React (see README "Prerequisites").
 * `fill="currentColor"` so each icon takes the color of the button/text
 * it sits in, same as every CSS-drawn icon elsewhere in this file.
 */

export function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z" />
    </svg>
  );
}

export function DeleteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
    </svg>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" />
    </svg>
  );
}

export function FilesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z" />
    </svg>
  );
}

/** A page with a folded corner — each source file's row in the Files panel. */
export function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6B7280"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/** A gear, shared by the header's Settings button and the Settings dialog's badge. */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 1.9 1.5a7.6 7.6 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z" />
    </svg>
  );
}

/*
 * The side-bar chrome (ActivityBar, SidePanel): line icons drawn on the same
 * 24-unit grid and stroke as GearIcon, in `currentColor` so the rail's
 * muted/active/hover colours carry through.
 */
const lineIconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Two stacked pages — the Explorer (Simulation + Files) side bar. */
export function ExplorerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...lineIconProps} {...props}>
      <path d="M15 3H9.5A1.5 1.5 0 0 0 8 4.5v11A1.5 1.5 0 0 0 9.5 17h8a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <polyline points="15 3 15 7 19 7" />
      <path d="M5 7.5v12A1.5 1.5 0 0 0 6.5 21H15" />
    </svg>
  );
}

/** A chip with its pins — the Board I/O pane. */
export function BoardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...lineIconProps} {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" />
      <path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5" />
    </svg>
  );
}

/** A window with its side bar ruled off and an arrow pushing it shut. */
export function PanelCloseIcon({ side, ...props }: SVGProps<SVGSVGElement> & { side: 'left' | 'right' }) {
  const left = side === 'left';
  return (
    <svg {...lineIconProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={left ? 'M9 4v16' : 'M15 4v16'} />
      <polyline points={left ? '15.5 9.5 13 12 15.5 14.5' : '8.5 9.5 11 12 8.5 14.5'} />
    </svg>
  );
}

/** An outlined teal triangle — starts a simulation (SimToggle). */
export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" stroke="#0D9488" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** An outlined red rounded square — stops the running simulation (SimToggle). */
export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" stroke="#EF4444" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
