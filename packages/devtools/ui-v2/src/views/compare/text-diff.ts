import type { DiffLine } from "./types";

// ── LCS-based line diff ─────────────────────────────────────────────────────

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp;
}

function backtrack(
  leftLines: string[],
  rightLines: string[],
  dp: number[][],
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = leftLines.length;
  let j = rightLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      result.push({
        type: "equal",
        left: leftLines[i - 1],
        right: rightLines[j - 1],
        lineNum: { left: i, right: j },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        type: "added",
        right: rightLines[j - 1],
        lineNum: { right: j },
      });
      j--;
    } else {
      result.push({
        type: "removed",
        left: leftLines[i - 1],
        lineNum: { left: i },
      });
      i--;
    }
  }

  return result.reverse();
}

export function computeTextDiff(leftStr: string, rightStr: string): DiffLine[] {
  if (leftStr === rightStr) {
    return leftStr.split("\n").map((line, i) => ({
      type: "equal",
      left: line,
      right: line,
      lineNum: { left: i + 1, right: i + 1 },
    }));
  }

  const leftLines = leftStr ? leftStr.split("\n") : [];
  const rightLines = rightStr ? rightStr.split("\n") : [];
  const dp = lcsTable(leftLines, rightLines);

  return backtrack(leftLines, rightLines, dp);
}
