import { type DiffSelection, type RepoCommitInfo } from '../types/diff';
import {
  createDiffSelection,
  diffSelectionsEqual,
  normalizeBaseMode,
} from '../utils/diffSelection';

/**
 * Semantic git views shown in the navigator. Each one is only a preset over
 * difit's existing base/target/baseMode diff model - see `gitViewToSelection`.
 */
export type GitView =
  | { type: 'unstaged' }
  | { type: 'staged' }
  | { type: 'commit'; sha: string }
  | { type: 'branch'; base: string }
  | { type: 'final'; base: string }
  | { type: 'custom'; selection: DiffSelection };

export interface GitViewContext {
  baseBranch: string | null;
  commits: RepoCommitInfo[];
  /** Commit hash the server resolved the current target to, if any. */
  resolvedTargetCommitish?: string;
}

/**
 * Translate a semantic view into the selection `/api/diff` already understands.
 *
 * - unstaged: `git diff`               (working tree vs index)
 * - staged:   `git diff --cached HEAD` (index vs HEAD)
 * - commit:   `sha^..sha`
 * - branch:   `git diff base...HEAD`   (merge-base vs HEAD)
 * - final:    `git diff $(merge-base)` (merge-base vs working tree)
 */
export function gitViewToSelection(view: GitView): DiffSelection {
  switch (view.type) {
    case 'unstaged':
      return createDiffSelection('staged', 'working');
    case 'staged':
      return createDiffSelection('HEAD', 'staged');
    case 'commit':
      return createDiffSelection(`${view.sha}^`, view.sha);
    case 'branch':
      return createDiffSelection(view.base, 'HEAD', 'merge-base');
    case 'final':
      return createDiffSelection(view.base, '.', 'merge-base');
    case 'custom':
      return view.selection;
  }
}

function matchesCommit(value: string | undefined, commit: RepoCommitInfo): boolean {
  if (!value) return false;
  return value === commit.shortHash || value === commit.hash;
}

/**
 * Figure out which view a selection represents, so the navigator stays in sync
 * when the revision selector (or the CLI's initial arguments) drives the diff.
 * Anything that isn't a known preset is reported as `custom`.
 */
export function matchGitView(selection: DiffSelection, context: GitViewContext): GitView {
  if (!selection.baseCommitish && !selection.targetCommitish) {
    return { type: 'custom', selection };
  }

  const presets: GitView[] = [{ type: 'unstaged' }, { type: 'staged' }];
  if (context.baseBranch) {
    presets.push(
      { type: 'branch', base: context.baseBranch },
      {
        type: 'final',
        base: context.baseBranch,
      },
    );
  }

  for (const preset of presets) {
    if (diffSelectionsEqual(selection, gitViewToSelection(preset))) {
      return preset;
    }
  }

  const isPreviousCommitPair =
    normalizeBaseMode(selection.baseMode) !== 'merge-base' &&
    Boolean(selection.targetCommitish) &&
    selection.baseCommitish === `${selection.targetCommitish}^`;

  if (isPreviousCommitPair) {
    const commit = context.commits.find(
      (candidate) =>
        matchesCommit(selection.targetCommitish, candidate) ||
        // `difit` started on HEAD^..HEAD resolves to the newest branch commit.
        (selection.targetCommitish === 'HEAD' &&
          matchesCommit(context.resolvedTargetCommitish, candidate)),
    );
    if (commit) {
      return { type: 'commit', sha: commit.shortHash };
    }
  }

  return { type: 'custom', selection };
}

/** Stable identity for a view, used for highlighting and React keys. */
export function gitViewKey(view: GitView): string {
  switch (view.type) {
    case 'commit':
      return `commit:${view.sha}`;
    case 'branch':
      return `branch:${view.base}`;
    case 'final':
      return `final:${view.base}`;
    case 'custom':
      return `custom:${view.selection.baseCommitish}:${view.selection.targetCommitish}:${normalizeBaseMode(
        view.selection.baseMode,
      )}`;
    default:
      return view.type;
  }
}
