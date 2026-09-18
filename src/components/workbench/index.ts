// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

export { Workbench } from './Workbench';
export { Header } from './Header';
export { FileExplorer } from './FileExplorer';
export type { FileExplorerProps } from './FileExplorer';
export { CodeEditor } from './CodeEditor';
export type { EditorTab, CodeEditorProps } from './CodeEditor';
export { SimulationCard } from './SimulationCard';
export type { SimStatus, SimulationCardProps } from './SimulationCard';
export { ConsoleOutput } from './ConsoleOutput';
export type { ConsoleLine, ConsoleOutputProps } from './ConsoleOutput';
export { STARTER_FILES, DEFAULT_OPEN_TABS, TOP_LEVEL_ENTITY } from './files';
export type { VhdlFile } from './files';
export { tokenizeVhdlLine } from './vhdlHighlight';
export type { Token, TokenType } from './vhdlHighlight';
