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
import { ProjectsSidebar } from './ProjectsSidebar';

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
  lists: { connection: signedOut, gitHubProjects, localProjects: local, opening: false, onOpenItem: ignore, onSignIn: ignore, onOpenFromUrl: ignore },
  onCreateProject: ignore,
  newProject: { language: 'vhdl', filesNow: [] },
  active: {
    project: newProject('Custom_Board', ['top.vhd'], 'de1-soc'),
    rows: [],
    busy: null,
    needsName: false,
    onDetailsChange: ignore,
    board: { boards: BUILT_IN_CATALOG, onChange: ignore, locked: false, onChooseBoard: ignore },
    files: { available: [], onAddFiles: ignore, onLeaveProject: ignore, onEntryChange: ignore, onOpenFile: ignore, onRemoveEntry: ignore, onReloadFromUrl: ignore, onFolderChosen: ignore },
    addFiles: { suggestedName: 'untitled1', existingNames: ['top.vhd'], onCreate: ignore, onBrowse: ignore, onDrop: ignore, busy: false },
    local: { saveHint: '', emptiedFolders: [], onRemoveFolder: ignore },
    github: { link: undefined, someoneElses: false, projects: gitHubProjects },
    onCloseProject: ignore,
  },
};

const render = (section: ProjectsSectionId, props: Partial<ProjectsPageProps> = {}) => renderToStaticMarkup(<ProjectsPage {...PROPS} {...props} section={section} />);

/** The visible text, without tags. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the sidebar', () => {
  test('puts New project directly after On GitHub, then the active project and its children', () => {
    const labels = [...render('all').matchAll(/class="wb-page-nav__item"[^>]*>.*?<\/span>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(['All projects', 'On this computer', 'On GitHub', 'New project', 'Active project', 'Overview', 'Files', 'Add file']);
  });

  test('marks New project while its form is shown', () => {
    expect(render('new')).toMatch(/aria-current="page"[^>]*><span class="wb-page-nav__icon">.*?<\/span>New project</);
  });

  test('puts a dot on the active project while it has unsaved changes', () => {
    expect(render('all')).toMatch(/<span class="wb-page-nav__dot" title="Unsaved changes"><\/span><\/span>Active project<span class="wb-page__sr">, Unsaved changes/);
    expect(render('all', { info: { ...info, unsaved: false } })).not.toContain('wb-page-nav__dot');
  });

  test('marks the section shown', () => {
    expect(render('github')).toMatch(/aria-current="page"[^>]*><span class="wb-page-nav__icon">.*?<\/span>On GitHub</);
  });

  test.each([['active', 'Overview'], ['active-files', 'Files']] as const)('marks only the selected child for %s', (section, label) => {
    const html = render(section);
    expect([...html.matchAll(/aria-current="page"/g)]).toHaveLength(1);
    expect(html).toMatch(new RegExp(`aria-current="page"[^>]*><span[^>]*>.*?</span>${label}</button>`));
  });

  test('keeps the parent navigation without a submenu when no active project actions exist', () => {
    const html = renderToStaticMarkup(<ProjectsSidebar current="active" unsaved={false} onSelect={ignore} onBack={ignore} />);
    expect(html).not.toContain('wb-projects-subnav');
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Active project/);
  });

  test('has Add file go to Add existing files rather than open a menu', () => {
    const addFileTag = /<button([^>]*)>(?:(?!<button).)*?Add file<\/button>/.exec(render('active'))?.[1];
    expect(addFileTag).toBe(' type="button" class="wb-page-nav__item"');
  });

  test('marks Add existing files as where Add file goes', () => {
    expect(render('active-files')).toContain('data-add-existing-files');
  });
});

test('Files keeps the overview and scrolls to its existing file section', () => {
  const html = render('active-files');
  expect(html).toContain('Project files (0)');
  expect(html).toContain('wb-projects-current');
  expect(html).toContain('>Project details<');
  expect(html).toContain('>Storage<');
  expect(html).toContain('data-project-files');
});

describe('adding files under Project files', () => {
  const busyPage = () => render('active-files', { active: { ...PROPS.active, addFiles: { ...PROPS.active.addFiles, busy: true } } });

  test('offers a new file in each language', () => {
    expect(textOf(render('active-files'))).toMatch(/Create new file VHDL file Verilog file/);
  });

  test('offers the drop area with Browse files', () => {
    expect(textOf(render('active-files'))).toMatch(/Add existing files Drag and drop files here or Browse files/);
  });

  test('puts the ways to add files after the file list', () => {
    const html = render('active-files');
    expect(html.indexOf('Create new file')).toBeGreaterThan(html.indexOf('No files in the project yet'));
  });

  test('points an empty project at the ways to add files', () => {
    expect(textOf(render('active-files'))).toContain('Create new ones or add existing files in Add files below.');
  });

  test('waits with the language buttons while the project is busy', () => {
    expect(busyPage().match(/wb-add-files__language" disabled=""/g)).toHaveLength(2);
  });

  test('puts Add files in a card of its own after Project files', () => {
    expect(textOf(render('active-files'))).toMatch(/Project files \(0\).*Add files Create new file/);
  });

  test('waits with Browse files while the project is busy', () => {
    expect(busyPage()).toMatch(/disabled="">Browse files/);
  });
});

describe('the active project card', () => {
  test('is shown in Active project only: the lists have the open project as their first row', () => {
    expect(render('active')).toContain('aria-label="Active project"');
    for (const section of ['all', 'local', 'github'] as const) expect(render(section)).not.toContain('aria-label="Active project"');
  });

  test('says it has unsaved changes and where Save writes it', () => {
    const text = textOf(render('active'));
    expect(text).toContain('Custom_Board Unsaved changes');
    expect(text).toContain(`Saves to this computer: ${info.location}`);
    expect(text).toContain('Save to this computer');
  });

  test('a project on GitHub saves there', () => {
    expect(textOf(render('active', { info: { ...info, destination: 'github' } }))).toContain('Saves to GitHub');
  });

  test('offers the way back to the editor', () => {
    expect(textOf(render('active'))).toContain('Open in workspace');
  });
});

describe('the lists header', () => {
  test('has a menu for a new project', () => {
    expect(render('all')).toMatch(/<header class="wb-page__header">.*aria-label="More: new project, open another".*<\/header>/);
  });
});

describe('a list', () => {
  test('shows a project by its name with its description, and Open', () => {
    const html = render('local');
    expect(textOf(html)).toContain('4-bit Adder Simple 4-bit adder with carry in and carry out.');
    expect(html).toContain('aria-label="Open 4-bit Adder"');
  });

  test('lists the open project once, its saved state beside Open now', () => {
    const text = textOf(render('local'));
    expect(text).toContain('Open now Unsaved changes');
  });

  test('On GitHub asks to sign in while signed out', () => {
    expect(textOf(render('github'))).toContain('Sign in to GitHub to see the projects saved on your account.');
  });
});

test('All projects shows where a project is stored as an icon, named for screen readers and in its tooltip', () => {
  const html = render('all');
  expect(html).toMatch(/<li title="On this computer"><svg[^]*?<span class="wb-page__sr">On this computer<\/span><\/li>/);
});

test('On this computer and On GitHub have no Location column: every project there is in that place', () => {
  expect(render('all')).toContain('>Location</th>');
  expect(render('local')).not.toContain('>Location</th>');
  const knightRider = { name: 'Knight Rider', description: '', url: 'https://gist.github.com/me/g1', gistId: 'g1', createdAt: '', updatedAt: '' };
  const signedIn = { ...PROPS.lists.connection, session: { user: { login: 'me', avatarUrl: '' } } } as GitHubConnection;
  const github = render('github', { lists: { ...PROPS.lists, connection: signedIn, gitHubProjects: { ...gitHubProjects, entries: [knightRider] } } });
  expect(github).toContain('aria-label="Open Knight Rider"');
  expect(github).not.toContain('>Location</th>');
});

describe('an empty list on this computer says why', () => {
  const emptyLocal = (over: Partial<LocalProjects>) => ({ ...PROPS.lists, localProjects: { ...local, items: [], ...over } as LocalProjects });
  const noOpenProject = { ...info, onComputer: false };

  test('the browser has not been allowed to read the folder again', () => {
    const text = textOf(render('local', { info: noOpenProject, lists: emptyLocal({ items: null, folderState: 'needs-permission' }) }));
    expect(text).toContain('The browser needs your permission to read projects');
    expect(text).toContain('Allow access');
  });

  test('no folder is chosen', () => {
    expect(textOf(render('all', { info: noOpenProject, lists: emptyLocal({ items: null, folderState: 'none' }) }))).toContain('No projects folder is chosen yet');
  });

  test('the folder has no projects: maybe they are in another', () => {
    const text = textOf(render('local', { info: noOpenProject, lists: emptyLocal({}) }));
    expect(text).toContain('No projects in projects. If your projects are in another folder, choose that one.');
    expect(text).toContain('Choose another folder…');
  });
});

describe('the Active project section', () => {
  test('has its details, storage, files, adding files and the rest, in that order', () => {
    const titles = [...render('active').matchAll(/class="wb-page-card__toggle"[^>]*>.*?<\/span>([^<]+)</g)].map((match) => match[1]);
    expect(titles).toEqual(['Project details', 'Storage', 'Project files (0)', 'Add files', 'Advanced']);
  });

  test('marks where Save writes', () => {
    expect(render('active')).toMatch(/This computer<\/strong><span class="wb-projects-chip is-destination">Save goes here/);
  });

  test('unfolds Project details when the name field is to get the focus', () => {
    const html = render('active', { nameAsk: { ...PROPS.nameAsk, focusPending: true } });
    expect(html).toMatch(/aria-expanded="true"[^>]*>.*?Project details/);
  });

  test('asks for a name while the project has none of its own', () => {
    const html = render('active', { active: { ...PROPS.active, needsName: true } });
    expect(html).toContain('placeholder="Enter project name"');
    expect(textOf(html)).toContain('Project name is required before it is saved');
  });
});

describe('the New project section', () => {
  test('has its heading and the short description', () => {
    expect(textOf(render('new'))).toContain('New project Create a new project with a name, board, and file.');
  });

  test('is a form inline in the page', () => {
    expect(render('new')).toContain('<form class="wb-newproject"');
  });

  test('is not a dialog', () => {
    expect(render('new')).not.toContain('role="dialog"');
  });

  test('has no folding header', () => {
    expect(render('new')).not.toContain('wb-page-card__toggle');
  });

  test('asks for the project name, board, file name and language, in that order', () => {
    const labels = [...render('new').matchAll(/class="wb-newproject__label"[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(['Project name', 'Board', 'File name', 'Language']);
  });

  test('starts on the open project\'s board, described under the list', () => {
    expect(textOf(render('new'))).toContain('Terasic DE1-SoC, System Builder names: KEY and HEX0 … HEX5.');
  });

  test('offers VHDL and Verilog as radio buttons, VHDL chosen', () => {
    const radios = [...render('new').matchAll(/<input type="radio"[^>]*>/g)].map(([tag]) => [/value="(\w+)"/.exec(tag)?.[1], tag.includes('checked')]);
    expect(radios).toEqual([['vhdl', true], ['verilog', false]]);
  });

  test('starts on the language preferred in Settings', () => {
    const checked = [...render('new', { newProject: { language: 'verilog', filesNow: [] } }).matchAll(/<input type="radio"[^>]*>/g)].find(([tag]) => tag.includes('checked'));
    expect(checked?.[0]).toContain('value="verilog"');
  });

  test('has Cancel and Create project, Create project the primary button', () => {
    expect(render('new')).toMatch(/>Cancel<\/button><button type="submit" class="wb-projects__btn is-primary">Create project</);
  });

  test('says which project it replaces, and that its unsaved changes are asked about', () => {
    expect(textOf(render('new'))).toContain('The new project replaces the open project, Custom_Board . It has unsaved changes');
  });

  test('follows the open project\'s board until another is chosen', () => {
    const onBasys = { ...PROPS.active, project: newProject('Basys lab', [], 'basys3') };
    expect(render('new', { active: onBasys })).toMatch(/<option value="basys3" selected="">/);
  });

  test('says nothing about the files in Files before a name is typed', () => {
    const html = render('new', { newProject: { language: 'vhdl', filesNow: ['DE1_SoC.vhdl'] } });
    expect(textOf(html)).not.toContain('If you keep the files');
  });

  test('names no project when the open one has no name yet', () => {
    expect(textOf(render('new', { info: { ...info, name: '' } }))).toContain('The new project replaces the open project. It has');
  });

  test('has no ⋮ menu of its own', () => {
    expect(render('new')).not.toContain('More: new project, open another');
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
