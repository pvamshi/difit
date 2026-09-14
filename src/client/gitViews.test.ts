import { describe, expect, it } from 'vitest';

import { type RepoCommitInfo } from '../types/diff';
import { createDiffSelection } from '../utils/diffSelection';

import { type GitView, gitViewKey, gitViewToSelection, matchGitView } from './gitViews';

const commits: RepoCommitInfo[] = [
  { hash: 'a'.repeat(40), shortHash: 'aaaaaaa', message: 'Add authentication API' },
  { hash: 'b'.repeat(40), shortHash: 'bbbbbbb', message: 'Add login form' },
];

const context = { baseBranch: 'origin/main', commits };

describe('gitViewToSelection', () => {
  it('maps unstaged to working vs the index', () => {
    expect(gitViewToSelection({ type: 'unstaged' })).toEqual({
      baseCommitish: 'staged',
      targetCommitish: 'working',
    });
  });

  it('maps staged to the index vs HEAD', () => {
    expect(gitViewToSelection({ type: 'staged' })).toEqual({
      baseCommitish: 'HEAD',
      targetCommitish: 'staged',
    });
  });

  it('maps a commit to its parent range', () => {
    expect(gitViewToSelection({ type: 'commit', sha: 'aaaaaaa' })).toEqual({
      baseCommitish: 'aaaaaaa^',
      targetCommitish: 'aaaaaaa',
    });
  });

  it('maps vs base to a merge-base comparison against HEAD', () => {
    expect(gitViewToSelection({ type: 'branch', base: 'origin/main' })).toEqual({
      baseCommitish: 'origin/main',
      targetCommitish: 'HEAD',
      baseMode: 'merge-base',
    });
  });

  it('maps final to a merge-base comparison against the working tree', () => {
    expect(gitViewToSelection({ type: 'final', base: 'origin/main' })).toEqual({
      baseCommitish: 'origin/main',
      targetCommitish: '.',
      baseMode: 'merge-base',
    });
  });

  it('passes a custom selection through unchanged', () => {
    const selection = createDiffSelection('v1.0.0', 'v2.0.0');

    expect(gitViewToSelection({ type: 'custom', selection })).toBe(selection);
  });
});

describe('matchGitView', () => {
  const roundTrip = (view: GitView) => matchGitView(gitViewToSelection(view), context);

  it('recognises every preset it produces', () => {
    expect(roundTrip({ type: 'unstaged' })).toEqual({ type: 'unstaged' });
    expect(roundTrip({ type: 'staged' })).toEqual({ type: 'staged' });
    expect(roundTrip({ type: 'branch', base: 'origin/main' })).toEqual({
      type: 'branch',
      base: 'origin/main',
    });
    expect(roundTrip({ type: 'final', base: 'origin/main' })).toEqual({
      type: 'final',
      base: 'origin/main',
    });
    expect(roundTrip({ type: 'commit', sha: 'aaaaaaa' })).toEqual({
      type: 'commit',
      sha: 'aaaaaaa',
    });
  });

  it('keeps branch views separate from the base branch used', () => {
    const selection = gitViewToSelection({ type: 'branch', base: 'develop' });

    expect(matchGitView(selection, context)).toEqual({ type: 'custom', selection });
  });

  it('resolves the CLI default HEAD^..HEAD to the newest branch commit', () => {
    const view = matchGitView(createDiffSelection('HEAD^', 'HEAD'), {
      ...context,
      resolvedTargetCommitish: 'aaaaaaa',
    });

    expect(view).toEqual({ type: 'commit', sha: 'aaaaaaa' });
  });

  it('reports unknown selections as custom', () => {
    const selection = createDiffSelection('v1.0.0', 'v2.0.0');

    expect(matchGitView(selection, context)).toEqual({ type: 'custom', selection });
  });

  it('hides branch presets when no base branch was detected', () => {
    const selection = gitViewToSelection({ type: 'branch', base: 'origin/main' });

    expect(matchGitView(selection, { baseBranch: null, commits })).toEqual({
      type: 'custom',
      selection,
    });
  });

  it('reports the empty startup selection as custom', () => {
    const selection = createDiffSelection('', '');

    expect(matchGitView(selection, context)).toEqual({ type: 'custom', selection });
  });
});

describe('gitViewKey', () => {
  it('distinguishes views of the same type', () => {
    expect(gitViewKey({ type: 'commit', sha: 'aaaaaaa' })).not.toBe(
      gitViewKey({ type: 'commit', sha: 'bbbbbbb' }),
    );
    expect(gitViewKey({ type: 'branch', base: 'main' })).not.toBe(
      gitViewKey({ type: 'final', base: 'main' }),
    );
  });
});
