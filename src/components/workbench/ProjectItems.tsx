// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { cx } from '../board';
import {
  ArrowDownIcon,
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
import { fileHit, relativeTime, type CatalogFile, type ProjectLanguage, type ProjectListItem, type SortOrder } from './projectCatalog';

/** What the three views of the list share (docs/project_browse_page.md § 4.6). */
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
const projectName = (item: ProjectListItem) => item.name || 'Untitled project';
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

/** Open: filled in the dense compact list, an outline with a folder in the cards. */
function OpenButton({ item, opening, onOpen, filled }: { item: ProjectListItem; filled: boolean } & Pick<RowActions, 'opening' | 'onOpen'>) {
  return (
    <button
      type="button"
      className={cx('wb-projects__btn', filled ? 'is-primary' : 'is-open')}
      onClick={() => onOpen(item)}
      disabled={opening}
      aria-label={`Open ${projectName(item)}`}
    >
      {!filled && <FolderOpenIcon aria-hidden="true" />}
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

/* ---------------------------------------------------------------- compact list */

export interface ProjectTableProps extends ProjectItemsProps {
  sort: SortOrder;
  onSort: (order: SortOrder) => void;
  /** All projects, shown or not: "Showing 1–3 of 7". */
  total: number;
}

/** The compact list: one table row per project. */
export function ProjectTable(props: ProjectTableProps) {
  const { items, sort, onSort, total } = props;
  const byDate = sort !== 'name';
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
            <th scope="col" aria-sort={byDate ? undefined : 'ascending'}>
              <SortButton label="Project name" active={!byDate} ascending onClick={() => onSort('name')} />
            </th>
            <th scope="col" className="is-desc">
              Description
            </th>
            <th scope="col">Stored</th>
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
            <TableRow key={item.key} {...props} item={item} />
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

function TableRow(props: ProjectItemsProps & { item: ProjectListItem }) {
  const { item, query, isOpenNow, onOpen } = props;
  const hit = fileHit(item, query);
  const description = hit ? `${hit.name}${hit.description === '' ? '' : ` — ${hit.description}`}` : item.description;
  return (
    <tr className={cx(isOpenNow(item) && 'is-open')} onDoubleClick={() => !props.opening && onOpen(item)}>
      <td>
        <span className="wb-projects__p-name">
          <Tile item={item} />
          <strong>{projectName(item)}</strong>
          {isOpenNow(item) && <OpenNowChip />}
        </span>
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
          <OpenButton item={item} opening={props.opening} onOpen={onOpen} filled />
          <ExternalButton item={item} onShowInFolder={props.onShowInFolder} />
          <MenuButton item={item} onMenu={props.onMenu} />
        </div>
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- details and small icons */

/** The details view and the small icons view: one card per project. */
export function ProjectCards(props: ProjectItemsProps & { grid: boolean }) {
  const { items, grid } = props;
  const Card = grid ? GridCard : DetailsCard;
  return (
    <ul className={cx('wb-projects__list', grid && 'is-grid')} aria-label="Projects">
      {items.map((item) => (
        <Card key={item.key} {...props} item={item} />
      ))}
    </ul>
  );
}

type CardProps = ProjectItemsProps & { item: ProjectListItem };

/** What both kinds of card show: the tile, the name, the description and a matching file. */
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

function DetailsCard(props: CardProps) {
  const { item, isOpenNow, opening, onOpen } = props;
  return (
    <li className={cx('wb-projects__item', isOpenNow(item) && 'is-open')} onDoubleClick={() => !opening && onOpen(item)}>
      <Tile item={item} />
      <CardBody {...props}>
        <ItemMeta item={item} />
      </CardBody>
      <Languages item={item} />
      <div className="wb-projects__item-actions">
        <OpenButton item={item} opening={opening} onOpen={onOpen} filled={false} />
        <ExternalButton item={item} onShowInFolder={props.onShowInFolder} />
        <MenuButton item={item} onMenu={props.onMenu} />
      </div>
    </li>
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
        <OpenButton item={item} opening={opening} onOpen={onOpen} filled={false} />
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
