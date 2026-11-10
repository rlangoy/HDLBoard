// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { BUILT_IN_CATALOG } from '../../../boards/boardCatalog';
import { newProject } from '../projectFile';
import type { ProjectListItem } from '../projectCatalog';
import type { GitHubConnection } from '../useGitHub';
import type { GitHubProjects } from '../useGitHubProjects';
import type { LocalProjects } from '../useLocalProjects';
import type { OpenProjectInfo } from './openProject';
import { ProjectsPage, type ProjectsPageProps } from './ProjectsPage';
import type { ProjectsSectionId } from './projectsSections';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const ignore = () => undefined;

const adder: ProjectListItem = {
  key: 'local:projects/adder.hdlboard.json',
  source: 'local',
  name: '4-bit Adder',
  description: 'Simple 4-bit adder with carry in and carry out.',
  files: [],
  languages: ['vhdl'],
  updatedAt: '2026-01-25T16:37:00Z',
  owner: '',
  location: 'projects/adder.hdlboard.json',
};

const local = { items: [adder], folderState: 'ready', folderLabel: 'projects', scanning: false, error: null, skipped: [], truncated: false, remembered: true, rescan: ignore, chooseFolder: ignore, allowAccess: ignore } as unknown as LocalProjects;
const signedOut = { session: null, step: { kind: 'idle' }, remembersSignIn: false, signOut: ignore } as unknown as GitHubConnection;
const gitHubProjects = { entries: null, busy: null, message: null, conflict: null, refresh: ignore, open: ignore, remove: ignore, save: async () => true, getGitHubVersion: ignore } as unknown as GitHubProjects;

const info: OpenProjectInfo = {
  name: 'Custom_Board',
  description: '',
  files: [],
  location: 'C:\\Users\\you\\Projects\\Custom_Board.hdlboard.json',
  gistId: undefined,
  onComputer: true,
  changedSinceLocalSave: true,
  syncState: 'not-on-github',
  destination: 'local',
  unsaved: true,
};

const PROPS: ProjectsPageProps = {
  section: 'all',
  onSectionChange: ignore,
  onClose: ignore,
  info,
  saves: { toComputer: ignore, toGitHub: ignore },
  nameAsk: { missing: false, focusPending: false, onFocused: ignore, ask: ignore },
  lists: { connection: signedOut, gitHubProjects, localProjects: local, opening: false, onOpenItem: ignore, onNewProject: ignore, onSignIn: ignore, onOpenFromUrl: ignore },
  active: {
    project: newProject('Custom_Board', ['top.vhd'], 'de1-soc'),
    rows: [],
    busy: null,
    needsName: false,
    onDetailsChange: ignore,
    board: { boards: BUILT_IN_CATALOG, onChange: ignore, locked: false, onChooseBoard: ignore },
    files: { available: [], onAddFiles: ignore, onLeaveProject: ignore, onEntryChange: ignore, onOpenFile: ignore, onRemoveEntry: ignore, onReloadFromUrl: ignore, onFolderChosen: ignore },
    local: { saveHint: '', emptiedFolders: [], onRemoveFolder: ignore },
    github: { link: undefined, someoneElses: false, projects: gitHubProjects },
    onCloseProject: ignore,
  },
};

const render = (section: ProjectsSectionId, props: Partial<ProjectsPageProps> = {}) => renderToStaticMarkup(<ProjectsPage {...PROPS} {...props} section={section} />);

/** The visible text, without tags. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the sidebar', () => {
  test('lists where projects are stored, and the active project at its foot', () => {
    const labels = [...render('all').matchAll(/class="wb-page-nav__item"[^>]*>.*?<\/span>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(['All projects', 'On this computer', 'On GitHub', 'Active project']);
  });

  test('marks the section shown', () => {
    expect(render('github')).toMatch(/aria-current="page"[^>]*><span class="wb-page-nav__icon">.*?<\/span>On GitHub</);
  });
});

describe('the active project, on top of every section', () => {
  test('says it has unsaved changes and where Save writes it', () => {
    const text = textOf(render('local'));
    expect(text).toContain('Custom_Board Unsaved changes');
    expect(text).toContain('Saves to this computer: C:\\Users\\you\\Projects\\Custom_Board.hdlboard.json');
    expect(text).toContain('Save to this computer');
  });

  test('a project on GitHub saves there', () => {
    expect(textOf(render('all', { info: { ...info, destination: 'github' } }))).toContain('Saves to GitHub');
  });

  test('offers the way back to the editor', () => {
    expect(textOf(render('all'))).toContain('Open in workspace');
  });
});

describe('a list', () => {
  test('shows a project by its name with its description, and Open', () => {
    const html = render('local');
    expect(textOf(html)).toContain('4-bit Adder Simple 4-bit adder with carry in and carry out.');
    expect(html).toContain('aria-label="Open 4-bit Adder"');
  });

  test('lists the open project once, with the saved state of its place', () => {
    const text = textOf(render('local'));
    expect(text).toContain('Open now');
    expect(text).toMatch(/On this computer Unsaved changes/);
  });

  test('On GitHub asks to sign in while signed out', () => {
    expect(textOf(render('github'))).toContain('Sign in to GitHub to see the projects saved on your account.');
  });
});

describe('the Active project section', () => {
  test('has its details, storage, files and the rest, in that order', () => {
    const titles = [...render('active').matchAll(/class="wb-page-card__toggle"[^>]*>.*?<\/span>([^<]+)</g)].map((match) => match[1]);
    expect(titles).toEqual(['Project details', 'Storage', 'Project files (0)', 'Advanced']);
  });

  test('marks where Save writes', () => {
    expect(render('active')).toMatch(/This computer<\/strong><span class="wb-projects-chip is-destination">Save goes here/);
  });

  test('asks for a name while the project has none of its own', () => {
    const html = render('active', { active: { ...PROPS.active, needsName: true } });
    expect(html).toContain('placeholder="Enter project name"');
    expect(textOf(html)).toContain('Project name is required before it is saved');
  });
});

describe('UnsavedChangesDialog', () => {
  test('offers Save, Discard changes and Cancel, and says where the changes are not saved', () => {
    const html = renderToStaticMarkup(
      <UnsavedChangesDialog question={{ projectName: 'Custom_Board', destination: 'github', opening: 'Knight Rider' }} onAnswer={ignore} />,
    );
    const text = textOf(html);
    expect(text).toContain('Custom_Board has changes that are not saved on GitHub.');
    expect([...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((match) => match[1])).toEqual(expect.arrayContaining(['Cancel', 'Discard changes', 'Save']));
  });
});
