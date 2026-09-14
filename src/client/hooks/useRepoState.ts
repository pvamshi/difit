import { useCallback, useEffect, useRef, useState } from 'react';

import { type RepoCommitInfo, type RepoStateResponse } from '../../types/diff';

interface RepoStateHook {
  repoState: RepoStateResponse | null;
  refreshRepoState: () => Promise<void>;
}

function parseCommits(value: unknown): RepoCommitInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (commit): commit is RepoCommitInfo =>
      typeof commit === 'object' &&
      commit !== null &&
      typeof (commit as RepoCommitInfo).hash === 'string' &&
      typeof (commit as RepoCommitInfo).shortHash === 'string',
  );
}

function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseRepoState(payload: unknown): RepoStateResponse | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Partial<RepoStateResponse>;
  if (!('baseBranch' in candidate) && !('commits' in candidate)) {
    return null;
  }

  return {
    currentBranch: parseNullableString(candidate.currentBranch),
    headShortHash: parseNullableString(candidate.headShortHash),
    baseBranch: parseNullableString(candidate.baseBranch),
    detectedBaseBranch: parseNullableString(candidate.detectedBaseBranch),
    mergeBaseShortHash: parseNullableString(candidate.mergeBaseShortHash),
    commits: parseCommits(candidate.commits),
    commitsAreFallback: candidate.commitsAreFallback === true,
  };
}

/**
 * Current branch, detected base branch and branch commits, refetched whenever
 * the repository watcher reports a change.
 */
export function useRepoState(baseBranchOverride: string | null): RepoStateHook {
  const [repoState, setRepoState] = useState<RepoStateResponse | null>(null);
  const requestIdRef = useRef(0);

  const refreshRepoState = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const params = baseBranchOverride
        ? `?${new URLSearchParams({ base: baseBranchOverride }).toString()}`
        : '';
      const response = await fetch(`/api/repo-state${params}`);
      if (!response.ok) {
        if (requestIdRef.current === requestId) {
          setRepoState(null);
        }
        return;
      }

      const payload: unknown = await response.json();
      if (requestIdRef.current === requestId) {
        setRepoState(parseRepoState(payload));
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setRepoState(null);
      }
    }
  }, [baseBranchOverride]);

  useEffect(() => {
    void refreshRepoState();
  }, [refreshRepoState]);

  return { repoState, refreshRepoState };
}
