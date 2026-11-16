// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type DragEvent } from 'react';
import { droppedFileHandles, type FileHandles } from './fileSystemAccess';

/** Files dropped from the computer, with the handles Chrome and Edge give to them (fileSystemAccess.ts). */
export type FilesDropped = (files: FileList, handles: Promise<FileHandles>) => void;

export interface FileDrop {
  /** Files are being dragged over the element. */
  readonly dragging: boolean;
  readonly handlers: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
}

/**
 * Takes files dropped on an element, and tells while they are dragged over it. Only drags
 * that carry files count; dragging text or a row of the page is left alone.
 */
export function useFileDrop(onFilesDropped: FilesDropped): FileDrop {
  // A ref-counted depth rather than a plain boolean: dragging over a child
  // element fires dragleave on the parent before dragenter on the child,
  // so a naive "set false on dragleave" flickers the highlight off and on
  // as the pointer crosses every element underneath it.
  const [dragDepth, setDragDepth] = useState(0);

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragDepth((depth) => depth + 1);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!carriesFiles(event)) return;
    event.preventDefault(); // required for onDrop to fire at all
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragDepth((depth) => Math.max(0, depth - 1));
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragDepth(0);
    // The handles are asked for now: the drag data is emptied once the event is over.
    if (event.dataTransfer.files.length > 0) onFilesDropped(event.dataTransfer.files, droppedFileHandles(event.dataTransfer));
  };

  return { dragging: dragDepth > 0, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes('Files');
}
