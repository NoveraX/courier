import type { DiffLine } from "./types";

// ── LCS-based line diff ─────────────────────────────────────────────────────

/* The length of the longest common run of lines ending at a cell; 0 outside the table. */
function cell(dp: number[][], i: number, j: number): number {
  return dp[i]?.[j] ?? 0;
}

function lcsTable(a: string[], b: string[]): number[][] {
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    const row: number[] = [];
    for (let j = 0; j <= b.length; j++) {
      if (i === 0 || j === 0) row.push(0);
      else if (a[i - 1] === b[j - 1]) row.push(cell(dp, i - 1, j - 1) + 1);
      else row.push(Math.max(cell(dp, i - 1, j), row[j - 1] ?? 0));
    }
    dp.push(row);
  }

  return dp;
}

function backtrack(leftLines: string[], rightLines: string[], dp: number[][]): DiffLine[] {
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
    } else if (j > 0 && (i === 0 || cell(dp, i, j - 1) >= cell(dp, i - 1, j))) {
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
