/**
 * Large answers — thousands of records, megabytes of JSON read through
 * their schema — with Studio attached and without: what a call costs, and
 * how much of it Studio is sent, which must not grow with the answer.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { measured } from "./metrics.mjs";

/**
 * Call an endpoint with large answers, attached and not.
 *
 * @param {{ repo: string }} fixture - The repository, whose packages the probe imports
 * @returns {import("./metrics.mjs").Measured[]} The figures
 * @example
 * ```js
 * measurePayloads({ repo });
 * ```
 */
export function measurePayloads({ repo }) {
  const out = execFileSync(process.execPath, [join(import.meta.dirname, "payload-probe.mjs")], {
    cwd: repo,
    encoding: "utf8",
  });
  const seen = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
  return Object.entries(seen.sizes).flatMap(([count, bytes]) => {
    const megabytes = (bytes / 2 ** 20).toFixed(1);
    const plain = seen.plain[count];
    const attached = seen.attached[count];
    return [
      measured(`payload.${count}.plain`, plain, "ms", Math.max(20, (bytes / 2 ** 20) * 15), {
        note: `${count} records, ${megabytes} MB, read through their schema`,
      }),
      measured(`payload.${count}.attached`, attached, "ms", plain * 2.5, {
        note: `${(attached / plain).toFixed(2)}× the call without Studio`,
      }),
      measured(`payload.${count}.toStudio`, seen.attached[`${count}:eventBytes`] / 1024, "KB", 64, {
        note: "what Studio is sent of the call",
      }),
    ];
  });
}
