import { FileDiff, FilePen, FilePlus, GitBranch, GitCommitHorizontal, Sliders } from 'lucide-react';
import { memo } from 'react';

import { type RepoStateResponse, type RevisionsResponse } from '../../types/diff';
import { type GitView, gitViewKey } from '../gitViews';

interface GitViewNavProps {
  activeView: GitView;
  repoState: RepoStateResponse | null;
  branches: RevisionsResponse['branches'];
  baseBranchOverride: string | null;
  onSelectView: (view: GitView) => void;
  onChangeBaseBranch: (base: string | null) => void;
}

interface NavRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  detail?: React.ReactNode;
  isActive: boolean;
  indented?: boolean;
  title?: string;
  onClick: () => void;
}

function NavRow({ icon, label, detail, isActive, indented, title, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={isActive ? 'true' : undefined}
      className={`w-full flex items-center gap-2 py-1.5 pr-3 text-left text-sm transition-colors border-l-2 cursor-pointer ${
        indented ? 'pl-8' : 'pl-4'
      } ${
        isActive
          ? 'border-l-github-accent bg-github-bg-tertiary text-github-text-primary'
          : 'border-l-transparent text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text-primary'
      }`}
    >
      {icon}
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      {detail}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-github-text-muted">
      {children}
    </div>
  );
}

/**
 * Left-rail navigator over difit's diff engine: working-tree views, the
 * branch-vs-base views, and the commits this branch added on top of the base.
 */
export const GitViewNav = memo(function GitViewNav({
  activeView,
  repoState,
  branches,
  baseBranchOverride,
  onSelectView,
  onChangeBaseBranch,
}: GitViewNavProps) {
  const activeKey = gitViewKey(activeView);
  const baseBranch = repoState?.baseBranch ?? null;
  const commits = repoState?.commits ?? [];

  const baseOptions = Array.from(
    new Set(
      [
        repoState?.detectedBaseBranch,
        baseBranchOverride,
        baseBranch,
        ...branches.map((branch) => branch.name),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return (
    <nav className="border-b border-github-border" aria-label="Git views">
      <div className="px-4 py-2 border-b border-github-border bg-github-bg-tertiary flex items-center gap-2">
        <GitBranch size={14} className="text-github-text-secondary shrink-0" />
        <span
          className="text-sm text-github-text-primary overflow-hidden text-ellipsis whitespace-nowrap"
          title={repoState?.currentBranch ?? 'detached HEAD'}
        >
          {repoState?.currentBranch ?? 'detached HEAD'}
        </span>
        {repoState?.headShortHash && (
          <code className="ml-auto text-xs text-github-text-muted">{repoState.headShortHash}</code>
        )}
      </div>

      <SectionLabel>Working tree</SectionLabel>
      <NavRow
        icon={<FilePen size={14} />}
        label="Unstaged"
        isActive={activeKey === 'unstaged'}
        title="Changes not staged for commit (git diff)"
        onClick={() => onSelectView({ type: 'unstaged' })}
      />
      <NavRow
        icon={<FilePlus size={14} />}
        label="Staged"
        isActive={activeKey === 'staged'}
        title="Changes staged for commit (git diff --cached)"
        onClick={() => onSelectView({ type: 'staged' })}
      />

      {baseBranch ? (
        <>
          <SectionLabel>
            <span className="flex items-center justify-between gap-2">
              <span>vs base</span>
              <select
                value={baseBranch}
                aria-label="Base branch"
                className="max-w-[55%] bg-github-bg-primary border border-github-border rounded px-1 py-0.5 text-xs font-normal normal-case text-github-text-primary"
                onChange={(event) => {
                  const next = event.target.value;
                  onChangeBaseBranch(next === repoState?.detectedBaseBranch ? null : next);
                }}
              >
                {baseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </span>
          </SectionLabel>
          <NavRow
            icon={<GitBranch size={14} />}
            label="vs Base"
            detail={
              repoState?.mergeBaseShortHash ? (
                <code className="text-xs text-github-text-muted">
                  {repoState.mergeBaseShortHash}
                </code>
              ) : undefined
            }
            isActive={activeKey === `branch:${baseBranch}`}
            title={`Committed branch changes (git diff ${baseBranch}...HEAD)`}
            onClick={() => onSelectView({ type: 'branch', base: baseBranch })}
          />
          <NavRow
            icon={<FileDiff size={14} />}
            label="Final"
            isActive={activeKey === `final:${baseBranch}`}
            title={`Everything this branch would add, including uncommitted work (git diff $(git merge-base ${baseBranch} HEAD))`}
            onClick={() => onSelectView({ type: 'final', base: baseBranch })}
          />

          <SectionLabel>
            {repoState?.commitsAreFallback ? 'Recent commits' : 'Commits'}
          </SectionLabel>
          {commits.length === 0 ? (
            <p className="px-4 pb-2 text-xs text-github-text-muted">
              No commits on this branch yet
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {commits.map((commit) => (
                <NavRow
                  key={commit.hash}
                  indented
                  icon={<GitCommitHorizontal size={14} className="shrink-0" />}
                  label={
                    <span className="flex items-baseline gap-2">
                      <code className="text-xs text-github-text-muted">{commit.shortHash}</code>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {commit.message}
                      </span>
                    </span>
                  }
                  isActive={activeKey === `commit:${commit.shortHash}`}
                  title={`${commit.shortHash} ${commit.message}`}
                  onClick={() => onSelectView({ type: 'commit', sha: commit.shortHash })}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="px-4 py-2 text-xs text-github-text-muted">
          No base branch detected (looked for origin/HEAD, origin/main, origin/master, main,
          master).
        </p>
      )}

      {activeView.type === 'custom' && (
        <>
          <SectionLabel>Custom</SectionLabel>
          <NavRow
            icon={<Sliders size={14} />}
            label={`${activeView.selection.baseCommitish || '?'}...${
              activeView.selection.targetCommitish || '?'
            }`}
            isActive
            title="Selection made with the revision selector"
            onClick={() => onSelectView(activeView)}
          />
        </>
      )}
    </nav>
  );
});
