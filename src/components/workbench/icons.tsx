// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SVGProps } from 'react';

/*
 * Material Symbols Outlined — "edit", "delete", "download", "upload", "folder_zip",
 * "menu_book", "search", "close", "folder_open" and "info", wght 400 / GRAD 0 /
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

/** Material Symbols "upload": the Files panel's Upload File button. */
export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" />
    </svg>
  );
}

/** Material Symbols "folder_zip": Download All, which saves the project as one .zip. */
export function FolderZipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447-640l-80-80H160v480h400v-80h80v80h160v-400H640v80h-80v-80H447ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80v-480 480Z" />
    </svg>
  );
}

/** Material Symbols "menu_book": an open book — the Examples button and pane. */
export function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
    </svg>
  );
}

export function FolderOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640H447l-80-80H160v480l96-320h684L837-217q-8 26-29.5 41.5T760-160H160Zm84-80h516l72-240H316l-72 240Zm0 0 72-240-72 240Zm-84-400v-80 80Z" />
    </svg>
  );
}

export function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" {...props}>
      <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
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

// The arrow inside PanelToggleIcon, for a side bar on each edge: pointing
// towards that edge pushes the bar shut, and the same arrow mirrored pulls it
// back open.
const PANEL_ARROW = {
  left: { close: '15.5 9.5 13 12 15.5 14.5', open: '13 9.5 15.5 12 13 14.5' },
  right: { close: '8.5 9.5 11 12 8.5 14.5', open: '11 9.5 8.5 12 11 14.5' },
} as const;

/**
 * A window with its side bar ruled off on `side`, and an arrow: pushing the
 * bar shut (the pane's Hide button), or — `open` — the same arrow mirrored,
 * pulling it back out (the Show button on the rail left by a shut pane).
 */
export function PanelToggleIcon({
  side,
  open = false,
  ...props
}: SVGProps<SVGSVGElement> & { side: 'left' | 'right'; open?: boolean }) {
  return (
    <svg {...lineIconProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === 'left' ? 'M9 4v16' : 'M15 4v16'} />
      <polyline points={PANEL_ARROW[side][open ? 'open' : 'close']} />
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

/*
 * The testbench split view's role icons (docs/impl_split_screen.md § 4.13): 16×16,
 * stroke 1.5, round caps, in `currentColor` so a badge's ink colours them.
 */
const roleIconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** A chip with pins — design (RTL) code. */
export function ChipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...roleIconProps} {...props}>
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M6.5 1.75v2.25M9.5 1.75v2.25M6.5 12v2.25M9.5 12v2.25M1.75 6.5h2.25M1.75 9.5h2.25M12 6.5h2.25M12 9.5h2.25" />
    </svg>
  );
}

/** A lab flask — testbench (simulation-only) code. */
export function FlaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...roleIconProps} {...props}>
      <path d="M6 1.75h4M6.75 1.75v4.5L2.6 12.9a.9.9 0 0 0 .77 1.35h9.26a.9.9 0 0 0 .77-1.35L9.25 6.25v-4.5" />
      <path d="M4.4 10h7.2" />
    </svg>
  );
}

/** Two panes side by side — the view switch's Both. */
export function SplitViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...roleIconProps} {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M8 2.75v10.5" />
    </svg>
  );
}

/** A small downward chevron — the pane header's file name opens a menu. */
export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...roleIconProps} strokeWidth={1.6} {...props}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
