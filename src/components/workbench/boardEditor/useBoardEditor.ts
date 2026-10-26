// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { boardImportSettings } from '../../../boards/boardImportSettings';
import { appendBoard, changeAt, replaceBoard, valueAt, type BoardDocument, type BoardPath } from '../../../boards/boardEditorModel';
import { validateBoardDraft } from '../../../boards/boardEditorValidation';
import type { BoardDefinition } from '../../../boards/types';
import { useRepresentations } from './useRepresentations';
import { BUILT_IN_BOARD_IDS } from '../../../boards/boardEditorStorage';
import { newComponent, type OptionalComponent } from '../../../boards/optionalComponents';

export interface BoardEditorSource {
  document: BoardDocument;
  boards: readonly BoardDefinition[];
  initialBoardId: string;
  builtInBoardIds?: readonly string[];
  onSave: (file: BoardDocument, board: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export function useBoardEditor(source: BoardEditorSource) {
  const [boardId, setBoardId] = useState(source.boards.find((item) => item.id === source.initialBoardId)?.id ?? source.boards[0].id);
  const original = source.document.boards.find((board) => board.id === boardId) ?? source.document.boards[0];
  const [originalId, setOriginalId] = useState(String(original.id));
  const [draft, setDraft] = useState(original);
  const [saved, setSaved] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const readOnly = (source.builtInBoardIds ?? BUILT_IN_BOARD_IDS).includes(boardId) && !isNew;
  const board = source.boards.find((item) => item.id === boardId) ?? source.boards[0];
  const defaults = useMemo(() => boardImportSettings(board), [board]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const errors = useMemo(() => validateBoardDraft(draft, defaults, source.document.boards), [draft, defaults, source.document]);
  const mutations = useEditorMutations({ draft, defaults, source, originalId, isNew, readOnly, setDraft, setBoardId, setError });
  const save = () => persistDraft({ source, draft, errors, saving, isNew, originalId, setSaving, setSaved, setOriginalId, setIsNew, setError, dirtyRef });
  const request = useCallback((action: () => void) => { if (dirtyRef.current) setPending(() => action); else action(); }, []);
  const choose = (id: string) => request(() => {
    const next = source.document.boards.find((item) => item.id === id);
    if (next) { setBoardId(id); setOriginalId(id); setDraft(next); setSaved(next); setIsNew(false); setError(''); }
  });
  const createCopy = () => {
    if (!readOnly) return;
    const copy = editableCopy(draft, source.document.boards);
    const id = String(copy.id);
    setBoardId(id); setDraft(copy); setIsNew(true); setError('');
  };
  useUnsavedUnload(dirty);
  return { draft, boardId, ...mutations, errors, dirty, saving, error, save, request, choose, pending, readOnly, createCopy,
    keepEditing: () => setPending(null),
    discard: () => { dirtyRef.current = false; setDraft(saved); setBoardId(String(saved.id)); setOriginalId(String(saved.id)); setIsNew(false); setPending(null); pending?.(); },
    saveAndContinue: async () => { if (await save()) { setPending(null); pending?.(); } },
    cancel: () => { dirtyRef.current = false; setDraft(saved); setBoardId(String(saved.id)); setOriginalId(String(saved.id)); source.onClose(); },
  };
}

interface EditorMutationOptions {
  draft: Record<string, unknown>; defaults: unknown; source: BoardEditorSource; originalId: string;
  isNew: boolean; readOnly: boolean; setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
  setBoardId: Dispatch<SetStateAction<string>>; setError: Dispatch<SetStateAction<string>>;
}
function useEditorMutations(options: EditorMutationOptions) {
  const { draft, defaults, source, originalId, isNew, readOnly, setDraft, setBoardId, setError } = options;
  const removed = useRef(new Map<string, unknown>());
  const get = (path: BoardPath) => valueAt(draft, path) ?? editorDefault(defaults, path);
  const change = (path: BoardPath, value: unknown) => {
    setDraft((current) => changeAt(current, path, value) as Record<string, unknown>); setError('');
  };
  const changeBoardName = (name: string) => {
    if (readOnly) return;
    const id = boardIdFromName(name, source.document.boards, isNew ? undefined : originalId);
    setBoardId(id); setDraft((current) => changeAt(changeAt(current, ['name'], name), ['id'], id) as Record<string, unknown>); setError('');
  };
  const changeRepresentation = useRepresentations(draft, change);
  const setComponentPresent = (component: OptionalComponent, present: boolean) => {
    if (readOnly) return;
    const path = ['ports', component];
    const current = valueAt(draft, path);
    const key = `${originalId}:${component}`;
    if (!present && current !== undefined) removed.current.set(key, current);
    change(path, present ? current ?? removed.current.get(key) ?? newComponent(component) : undefined);
  };
  return { get, change, changeBoardName, changeRepresentation, setComponentPresent };
}

interface PersistDraftOptions {
  source: BoardEditorSource; draft: Record<string, unknown>; errors: Record<string, string>; saving: boolean; isNew: boolean;
  originalId: string; setSaving: Dispatch<SetStateAction<boolean>>; setSaved: Dispatch<SetStateAction<Record<string, unknown>>>;
  setOriginalId: Dispatch<SetStateAction<string>>;
  setIsNew: Dispatch<SetStateAction<boolean>>; setError: Dispatch<SetStateAction<string>>; dirtyRef: MutableRefObject<boolean>;
}
async function persistDraft(options: PersistDraftOptions) {
  const { source, draft, errors, saving, isNew, originalId, setSaving, setSaved, setOriginalId, setIsNew, setError, dirtyRef } = options;
  if (Object.keys(errors).length || saving) return false;
  setSaving(true); setError('');
  try {
    await source.onSave(isNew ? appendBoard(source.document, draft) : replaceBoard(source.document, draft, originalId), draft);
    setSaved(draft); setOriginalId(String(draft.id)); setIsNew(false); dirtyRef.current = false; return true;
  } catch (cause) {
    setError(`Could not save board settings: ${cause instanceof Error ? cause.message : String(cause)}. Your draft is still here.`);
    return false;
  } finally { setSaving(false); }
}

function editableCopy(board: Record<string, unknown>, existing: readonly Record<string, unknown>[]) {
  const names = new Set(existing.map((item) => String(item.name).toLowerCase()));
  const base = String(board.name).slice(0, COPY_NAME_BASE_LENGTH);
  let name = `${base} Custom`;
  let suffix = 2;
  while (names.has(name.toLowerCase())) { name = `${base.slice(0, COPY_NAME_BASE_LENGTH - String(suffix).length)} Custom ${suffix}`; suffix += 1; }
  const id = boardIdFromName(name, existing);
  return { ...board, id, name, description: `Custom board based on ${String(board.name)}` };
}

function boardIdFromName(name: string, existing: readonly Record<string, unknown>[], currentId?: string) {
  const used = new Set(existing.filter((board) => board.id !== currentId).map((board) => String(board.id)));
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'custom-board';
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    const ending = `-${suffix}`;
    id = `${base.slice(0, 32 - ending.length)}${ending}`;
    suffix += 1;
  }
  return id;
}

const COPY_NAME_BASE_LENGTH = 32;

function editorDefault(defaults: unknown, path: BoardPath) {
  const last = path[path.length - 1];
  if (last === 'activeLow' || last === 'digitEnablesActiveLow') return true;
  if (path[0] === 'labels' || ['clockMHz', 'clock500Hz', 'description', 'resources'].includes(String(last))) return valueAt(defaults, path);
  return undefined;
}

function useUnsavedUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
export type BoardEditor = ReturnType<typeof useBoardEditor>;
