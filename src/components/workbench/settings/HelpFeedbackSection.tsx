// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../../board';
import { ExternalLink } from '../ExternalLink';
import { ISSUES_URL } from '../project';
import { SettingsCard } from './SettingsCard';

const NEW_ISSUE = `${ISSUES_URL}/new`;

/** GitHub's new-issue page with a title prefix, so a report arrives already sorted into bug or suggestion. */
const newIssueUrl = (titlePrefix: string) => `${NEW_ISSUE}?title=${encodeURIComponent(titlePrefix)}`;

interface IssueAction {
  readonly title: string;
  readonly text: string;
  readonly href: string;
  readonly primary?: boolean;
}

const ISSUE_ACTIONS: readonly IssueAction[] = [
  { title: 'Report a bug', text: 'Something does not work as it should', href: newIssueUrl('Bug: '), primary: true },
  { title: 'Suggest an improvement', text: 'An idea for a feature or a setting', href: newIssueUrl('Suggestion: ') },
];

/** Settings › Help & feedback: the one thing a user can do to change the program — open an issue. */
export function HelpFeedbackSection() {
  return (
    <>
      <SettingsCard title="Help us improve it" wide>
        <p className="wb-settings-lead">
          Found a bug, or missing something? Please create an issue in the GitHub repository. Suggestions and
          bug reports are very welcome &mdash; they are how this tool gets better for the next group of students.
        </p>
        <div className="wb-settings-actions">
          {ISSUE_ACTIONS.map((action) => (
            <ExternalLink key={action.title} className={cx('wb-settings-action', action.primary && 'wb-settings-action--primary')} href={action.href}>
              <span className="wb-settings-action__title">{action.title}</span>
              <span className="wb-settings-action__text">{action.text}</span>
            </ExternalLink>
          ))}
        </div>
        <p className="wb-settings__note">
          <ExternalLink href={ISSUES_URL}>Browse existing issues</ExternalLink> &middot; a free GitHub account is needed to create one.
        </p>
      </SettingsCard>
      <SettingsCard title="Reporting a bug?" wide>
        <p className="wb-settings-lead">
          Tell us what you did, what you expected and what happened instead. Your HDL code, the text in the
          console panel and the version shown in About make it much easier to reproduce.
        </p>
      </SettingsCard>
    </>
  );
}
