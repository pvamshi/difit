import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DiffSelection } from '../types/diff.js';
import { createDiffSelection } from '../utils/diffSelection.js';

import { GitDiffParser } from './git-diff.js';

/**
 * Backend behaviour behind the git view navigator. Every view is a preset over
 * the existing base/target/baseMode model, so these tests pin the git semantics
 * each preset must keep: unstaged, staged, a single commit, branch-vs-base and
 * the "final" diff that includes uncommitted work.
 */

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'difit test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'difit test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(repoPath: string, args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=difit test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: repoPath, encoding: 'utf8', env: GIT_ENV },
  );
}

function write(repoPath: string, file: string, content: string): void {
  writeFileSync(join(repoPath, file), content, 'utf8');
}

function changedPaths(files: Array<{ path: string }>): string[] {
  return files.map((file) => file.path).sort();
}

describe('git view presets against a real repository', () => {
  let repoPath: string;
  let parser: GitDiffParser;
  let featureCommits: string[];

  const parse = (selection: DiffSelection) => parser.parseDiff(selection);

  beforeAll(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'difit-git-views-'));
    git(repoPath, ['init', '--initial-branch=main']);

    write(repoPath, 'base.txt', 'base\n');
    git(repoPath, ['add', 'base.txt']);
    git(repoPath, ['commit', '-m', 'Initial commit']);

    git(repoPath, ['switch', '-c', 'feature/auth']);

    write(repoPath, 'feature.ts', 'export const login = () => null;\n');
    git(repoPath, ['add', 'feature.ts']);
    git(repoPath, ['commit', '-m', 'Add login form']);

    write(repoPath, 'feature.ts', 'export const login = () => true;\n');
    git(repoPath, ['add', 'feature.ts']);
    git(repoPath, ['commit', '-m', 'Add authentication API']);

    // Staged-only change.
    write(repoPath, 'staged.txt', 'staged\n');
    git(repoPath, ['add', 'staged.txt']);

    // Unstaged-only change.
    write(repoPath, 'base.txt', 'base edited in the working tree\n');

    featureCommits = git(repoPath, ['log', '--format=%h', 'main..HEAD'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    parser = new GitDiffParser(repoPath);
  });

  afterAll(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('unstaged shows working tree changes that are not staged', async () => {
    const diff = await parse(createDiffSelection('staged', 'working'));

    expect(changedPaths(diff.files)).toEqual(['base.txt']);
  });

  it('staged shows index changes only', async () => {
    const diff = await parse(createDiffSelection('HEAD', 'staged'));

    expect(changedPaths(diff.files)).toEqual(['staged.txt']);
  });

  it('a commit view shows that commit alone', async () => {
    const [newestCommit] = featureCommits;
    const diff = await parse(createDiffSelection(`${newestCommit}^`, newestCommit));

    expect(changedPaths(diff.files)).toEqual(['feature.ts']);
    expect(diff.files[0]?.status).toBe('modified');
  });

  it('vs base shows committed branch changes from the merge base, without working tree work', async () => {
    const diff = await parse(createDiffSelection('main', 'HEAD', 'merge-base'));

    expect(changedPaths(diff.files)).toEqual(['feature.ts']);
    expect(diff.files[0]?.status).toBe('added');
  });

  it('final adds staged and unstaged work on top of the committed branch changes', async () => {
    const diff = await parse(createDiffSelection('main', '.', 'merge-base'));

    expect(changedPaths(diff.files)).toEqual(['base.txt', 'feature.ts', 'staged.txt']);
  });

  it('detects the local default branch when there is no remote', async () => {
    expect(await parser.getBaseBranch()).toBe('main');
    expect(await parser.getCurrentBranch()).toBe('feature/auth');
  });

  it('reports repository state with the commits this branch added', async () => {
    const repoState = await parser.getRepoState();

    expect(repoState.currentBranch).toBe('feature/auth');
    expect(repoState.baseBranch).toBe('main');
    expect(repoState.detectedBaseBranch).toBe('main');
    expect(repoState.commitsAreFallback).toBe(false);
    expect(repoState.commits.map((commit) => commit.message)).toEqual([
      'Add authentication API',
      'Add login form',
    ]);
    expect(repoState.mergeBaseShortHash).toBe(
      git(repoPath, ['rev-parse', '--short=7', 'main']).trim(),
    );
  });

  it('honours an explicit base branch override', async () => {
    const repoState = await parser.getRepoState('HEAD~1');

    expect(repoState.baseBranch).toBe('HEAD~1');
    expect(repoState.detectedBaseBranch).toBe('main');
    expect(repoState.commits.map((commit) => commit.message)).toEqual(['Add authentication API']);
  });

  it('falls back to recent commits when the branch has not diverged from the base', async () => {
    git(repoPath, ['switch', 'main']);
    try {
      const repoState = await parser.getRepoState();

      expect(repoState.currentBranch).toBe('main');
      expect(repoState.commitsAreFallback).toBe(true);
      expect(repoState.commits.map((commit) => commit.message)).toEqual(['Initial commit']);
    } finally {
      git(repoPath, ['switch', 'feature/auth']);
    }
  });
});

describe('base branch detection with a remote', () => {
  let repoPath: string;
  let remotePath: string;
  let parser: GitDiffParser;

  beforeAll(() => {
    remotePath = mkdtempSync(join(tmpdir(), 'difit-git-views-remote-'));
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remotePath], { env: GIT_ENV });

    repoPath = mkdtempSync(join(tmpdir(), 'difit-git-views-clone-'));
    git(repoPath, ['init', '--initial-branch=main']);
    write(repoPath, 'base.txt', 'base\n');
    git(repoPath, ['add', 'base.txt']);
    git(repoPath, ['commit', '-m', 'Initial commit']);
    git(repoPath, ['remote', 'add', 'origin', remotePath]);
    git(repoPath, ['push', '-u', 'origin', 'main']);
    git(repoPath, ['remote', 'set-head', 'origin', '-a']);
    git(repoPath, ['switch', '-c', 'feature/remote']);

    parser = new GitDiffParser(repoPath);
  });

  afterAll(() => {
    rmSync(repoPath, { recursive: true, force: true });
    rmSync(remotePath, { recursive: true, force: true });
  });

  it('prefers the remote default branch over the local one', async () => {
    expect(await parser.getBaseBranch()).toBe('origin/main');

    const repoState = await parser.getRepoState();
    expect(repoState.baseBranch).toBe('origin/main');
  });
});
