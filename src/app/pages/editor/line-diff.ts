/**
 * Line-level diff for the conflict resolver. Classic LCS dynamic programming —
 * documentation pages are small, so O(n·m) is comfortably fast; pathological
 * sizes fall back to one whole-file conflict hunk.
 */

export interface DiffHunk {
  readonly kind: 'same' | 'conflict';
  /** Lines both versions share (kind 'same'). */
  same: string;
  /** The upstream version's lines for this hunk (kind 'conflict'). */
  theirs: string;
  /** The staged version's lines for this hunk (kind 'conflict'). */
  mine: string;
}

export function diffLines(theirsText: string, mineText: string): DiffHunk[] {
  const a = theirsText.split('\n');
  const b = mineText.split('\n');
  const m = a.length;
  const n = b.length;

  if (m * n > 4_000_000) {
    return [{ kind: 'conflict', same: '', theirs: theirsText, mine: mineText }];
  }

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const width = n + 1;
  const dp = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const hunks: DiffHunk[] = [];
  const last = () => hunks[hunks.length - 1];

  const pushSame = (line: string) => {
    if (last()?.kind === 'same') last().same += '\n' + line;
    else hunks.push({ kind: 'same', same: line, theirs: '', mine: '' });
  };
  const pushConflict = (theirs: string | null, mine: string | null) => {
    if (last()?.kind !== 'conflict') hunks.push({ kind: 'conflict', same: '', theirs: '', mine: '' });
    const hunk = last();
    if (theirs !== null) hunk.theirs += (hunk.theirs ? '\n' : '') + theirs;
    if (mine !== null) hunk.mine += (hunk.mine ? '\n' : '') + mine;
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pushSame(a[i]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      pushConflict(a[i], null);
      i++;
    } else {
      pushConflict(null, b[j]);
      j++;
    }
  }
  while (i < m) pushConflict(a[i++], null);
  while (j < n) pushConflict(null, b[j++]);

  return hunks;
}
