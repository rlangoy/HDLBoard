// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Fragment, useState, type ReactNode } from 'react';
import { cx } from '../board';
import {
  ArrowDownIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeIcon,
  FileIcon,
  FolderOpenIcon,
  GitHubIcon,
  LaptopIcon,
  MoreIcon,
  OpenInIcon,
  PersonIcon,
} from './icons';
import { displayName, fileHit, relativeTime, type CatalogFile, type ProjectLanguage, type ProjectListItem, type SortOrder } from './projectCatalog';

/** What the two views of the list share (docs/project_browse_page.md § 4.6). */
export interface ProjectItemsProps {
  items: readonly ProjectListItem[];
  /** The search text: a file that matched it is shown under its project. */
  query: string;
  /** Every Open button waits while a project is opening. */
  opening: boolean;
  isOpenNow: (item: ProjectListItem) => boolean;
  onOpen: (item: ProjectListItem) => void;
  /** Opens the row's ⋮ menu below `button`. */
  onMenu: (item: ProjectListItem, button: HTMLElement) => void;
  /** Present only where a local project can be shown in Explorer (the Windows app). */
  onShowInFolder?: (item: ProjectListItem) => void;
}

const LANGUAGE_LABEL: Record<ProjectLanguage, string> = { vhdl: 'VHDL', verilog: 'Verilog' };

type LanguageKind = ProjectLanguage | 'both' | 'none';

function languageKind(item: ProjectListItem): LanguageKind {
  if (item.languages.length > 1) return 'both';
  return item.languages[0] ?? 'none';
}

const languageTitle = (item: ProjectListItem) => item.languages.map((l) => LANGUAGE_LABEL[l]).join(' + ') || 'No source files';
const projectName = (item: ProjectListItem) => displayName(item.name) || 'Untitled project';
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString();

function Tile({ item }: { item: ProjectListItem }) {
  return (
    <span className={cx('wb-projects__tile', `is-${languageKind(item)}`)} title={languageTitle(item)} aria-hidden="true">
      <CodeIcon />
    </span>
  );
}

function SourceBadge({ item }: { item: ProjectListItem }) {
  const github = item.source === 'github';
  return (
    <span className={cx('wb-projects__badge', github ? 'is-github' : 'is-local')} title={github ? 'Stored on GitHub' : 'Stored on this computer'}>
      {github ? <GitHubIcon aria-hidden="true" /> : <LaptopIcon aria-hidden="true" />}
      <span className="wb-projects__badge-text">{github ? 'GitHub' : 'Local'}</span>
    </span>
  );
}

function Languages({ item }: { item: ProjectListItem }) {
  return (
    <div className="wb-projects__langs">
      {item.languages.map((language) => (
        <span key={language} className={cx('wb-projects__lang', `is-${language}`)}>
          {LANGUAGE_LABEL[language]}
        </span>
      ))}
    </div>
  );
}

function OpenNowChip() {
  return <span className="wb-projects__chip is-open">Open now</span>;
}

/** The matching file under its project while searching: `counter.vhd — 4-bit counter`. */
function FileHit({ file }: { file: CatalogFile }) {
  return (
    <span className="wb-projects__hit">
      <FileIcon aria-hidden="true" />
      <span>
        <strong>{file.name}</strong>
        {file.description !== '' && ` — ${file.description}`}
      </span>
    </span>
  );
}

type RowActions = Pick<ProjectItemsProps, 'opening' | 'onOpen' | 'onMenu' | 'onShowInFolder'>;

/** Open: `filled` in the dense table rows, where it is the strongest thing in the row; `outline` with a folder in the cards. */
function OpenButton({ item, opening, onOpen, look }: { item: ProjectListItem; look: 'filled' | 'outline' } & Pick<RowActions, 'opening' | 'onOpen'>) {
  return (
    <button
      type="button"
      className={cx('wb-projects__btn', look === 'filled' ? 'is-primary' : 'is-open')}
      onClick={() => onOpen(item)}
      disabled={opening}
      aria-label={`Open ${projectName(item)}`}
    >
      {look === 'outline' && <FolderOpenIcon aria-hidden="true" />}
      Open
    </button>
  );
}

function MenuButton({ item, onMenu }: { item: ProjectListItem } & Pick<RowActions, 'onMenu'>) {
  return (
    <button
      type="button"
      className="wb-projects__icon-btn is-more"
      onClick={(e) => onMenu(item, e.currentTarget)}
      aria-haspopup="menu"
      aria-label={`More about ${projectName(item)}`}
    >
      <MoreIcon aria-hidden="true" />
    </button>
  );
}

function ExternalButton({ item, onShowInFolder }: { item: ProjectListItem; onShowInFolder?: (item: ProjectListItem) => void }) {
  if (item.source === 'github') {
    return (
      <a
        className="wb-projects__icon-btn is-external"
        href={item.location}
        target="_blank"
        rel="noreferrer"
        aria-label={`Show ${projectName(item)} on github.com`}
        title="Show on github.com"
      >
        <OpenInIcon aria-hidden="true" />
      </a>
    );
  }
  if (!onShowInFolder) return null;
  return (
    <button
      type="button"
      className="wb-projects__icon-btn is-external"
      onClick={() => onShowInFolder(item)}
      aria-label={`Show ${projectName(item)} in Explorer`}
      title="Show in Explorer"
    >
      <OpenInIcon aria-hidden="true" />
    </button>
  );
}

/** What the date says: nothing known, or when. */
function savedText(item: ProjectListItem): string {
  return item.updatedAt === '' ? '—' : relativeTime(item.updatedAt);
}

/* ---------------------------------------------------------------- details: the table */

export interface ProjectTableProps extends ProjectItemsProps {
  sort: SortOrder;
  onSort: (order: SortOrder) => void;
  /** All projects, shown or not: "Showing 1–3 of 7". */
  total: number;
}

/** The details view: one table row per project; a row opens to the project's details card. */
export function ProjectTable(props: ProjectTableProps) {
  const { items, sort, onSort, total } = props;
  const byDate = sort === 'newest' || sort === 'oldest';
  const bySource = sort === 'local' || sort === 'github';
  // One row at a time shows its details.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((shown) => (shown === key ? null : key));
  return (
    <div className="wb-projects__table-wrap">
      <table className="wb-projects__table" aria-label="Projects">
        <colgroup>
          <col className="is-name" />
          <col className="is-desc" />
          <col className="is-stored" />
          <col className="is-saved" />
          <col className="is-actions" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-sort={sort === 'name' ? 'ascending' : undefined}>
              <SortButton label="Project name" active={sort === 'name'} ascending onClick={() => onSort('name')} />
            </th>
            <th scope="col" className="is-desc">
              Description
            </th>
            <th scope="col" aria-sort={bySource ? (sort === 'github' ? 'ascending' : 'descending') : undefined}>
              <SortButton label="Stored" active={bySource} ascending={sort === 'github'} onClick={() => onSort(sort === 'local' ? 'github' : 'local')} />
            </th>
            <th scope="col" className="is-saved" aria-sort={byDate ? (sort === 'oldest' ? 'ascending' : 'descending') : undefined}>
              <SortButton label="Last saved" active={byDate} ascending={sort === 'oldest'} onClick={() => onSort(sort === 'newest' ? 'oldest' : 'newest')} />
            </th>
            <th scope="col" className="is-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.key}>
              <TableRow {...props} item={item} expanded={item.key === expanded} onToggle={() => toggle(item.key)} />
              {item.key === expanded && <DetailsRow {...props} item={item} />}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="wb-projects__table-foot">
        Showing {items.length === 0 ? 0 : `1–${items.length}`} of {total} projects
      </div>
    </div>
  );
}

interface SortButtonProps {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
}

function SortButton({ label, active, ascending, onClick }: SortButtonProps) {
  return (
    <button type="button" className={cx('wb-projects__th-sort', active && 'is-sorted', active && ascending && 'is-asc')} onClick={onClick}>
      {label}
      <ArrowDownIcon aria-hidden="true" />
    </button>
  );
}

interface TableRowProps extends ProjectItemsProps {
  item: ProjectListItem;
  expanded: boolean;
  onToggle: () => void;
}

/** One project; a click on it (not on its buttons) shows its details below it. */
function TableRow(props: TableRowProps) {
  const { item, query, isOpenNow, onOpen, expanded, onToggle } = props;
  const hit = fileHit(item, query);
  const description = hit ? `${hit.name}${hit.description === '' ? '' : ` — ${hit.description}`}` : item.description;
  return (
    <tr
      className={cx('wb-projects__row', isOpenNow(item) && 'is-open', expanded && 'is-expanded')}
      onClick={(e) => !(e.target as Element).closest('button, a') && onToggle()}
    >
      <td>
        <button type="button" className="wb-projects__p-name" onClick={onToggle} aria-expanded={expanded} title={item.name}>
          <ChevronDownIcon className="wb-projects__p-chevron" aria-hidden="true" />
          <Tile item={item} />
          <strong>{projectName(item)}</strong>
          {isOpenNow(item) && <OpenNowChip />}
        </button>
      </td>
      <td className="is-desc">
        <div className={cx('wb-projects__p-desc', hit && 'is-hit')} title={description}>
          {description}
        </div>
      </td>
      <td>
        <SourceBadge item={item} />
      </td>
      <td className="is-saved">
        <span className="wb-projects__p-saved" title={item.updatedAt === '' ? 'Not known' : formatDateTime(item.updatedAt)}>
          {savedText(item)}
        </span>
      </td>
      <td>
        <div className="wb-projects__p-actions">
          <OpenButton item={item} opening={props.opening} onOpen={onOpen} look="filled" />
          <ExternalButton item={item} onShowInFolder={props.onShowInFolder} />
          <MenuButton item={item} onMenu={props.onMenu} />
        </div>
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- small icons */

/** The small icons view: one card per project. */
export function ProjectGrid(props: ProjectItemsProps) {
  return (
    <ul className="wb-projects__grid" aria-label="Projects">
      {props.items.map((item) => (
        <GridCard key={item.key} {...props} item={item} />
      ))}
    </ul>
  );
}

type CardProps = ProjectItemsProps & { item: ProjectListItem };

/** What a card shows of a project: its name, description and a matching file. */
function CardBody({ item, query, isOpenNow, children }: CardProps & { children?: ReactNode }) {
  const hit = fileHit(item, query);
  return (
    <div className="wb-projects__item-main">
      <h3 className="wb-projects__item-name">
        <span>{projectName(item)}</span>
        {isOpenNow(item) && <OpenNowChip />}
      </h3>
      {item.description !== '' && <p className="wb-projects__item-desc">{item.description}</p>}
      {hit && <FileHit file={hit} />}
      {children}
    </div>
  );
}

/** An open row's details card, below the row, across the table. */
function DetailsRow(props: CardProps) {
  return (
    <tr className="wb-projects__detail-row">
      <td colSpan={5}>
        <div className="wb-projects__item">
          <DetailsCardContent {...props} />
        </div>
      </td>
    </tr>
  );
}

function DetailsCardContent(props: CardProps) {
  const { item, opening, onOpen } = props;
  return (
    <>
      <Tile item={item} />
      <CardBody {...props}>
        <ItemMeta item={item} />
      </CardBody>
      <Languages item={item} />
      <div className="wb-projects__item-actions">
        <OpenButton item={item} opening={opening} onOpen={onOpen} look="outline" />
        <ExternalButton item={item} onShowInFolder={props.onShowInFolder} />
        <MenuButton item={item} onMenu={props.onMenu} />
      </div>
    </>
  );
}

/** A small icons card: the source badge and ⋮ in the corner, Open along the bottom. */
function GridCard(props: CardProps) {
  const { item, isOpenNow, opening, onOpen } = props;
  return (
    <li className={cx('wb-projects__item', isOpenNow(item) && 'is-open')} onDoubleClick={() => !opening && onOpen(item)}>
      <Tile item={item} />
      <CardBody {...props} />
      <Languages item={item} />
      <span className="wb-projects__item-corner">
        <SourceBadge item={item} />
        <MenuButton item={item} onMenu={props.onMenu} />
      </span>
      <div className="wb-projects__item-actions">
        <OpenButton item={item} opening={opening} onOpen={onOpen} look="outline" />
      </div>
    </li>
  );
}

/** Who, when, and where it is stored. */
function ItemMeta({ item }: { item: ProjectListItem }): ReactNode {
  return (
    <div className="wb-projects__item-meta">
      <span>
        <PersonIcon aria-hidden="true" />
        {item.source === 'github' ? item.owner : 'This computer'}
      </span>
      {item.updatedAt !== '' && (
        <span>
          <ClockIcon aria-hidden="true" />
          Updated {formatDate(item.updatedAt)}
        </span>
      )}
      <SourceBadge item={item} />
    </div>
  );
}
