/**
 * TypeScript over the whole enterprise project — every API, every file that
 * calls one, every library — as the project's build and its editor run it:
 * how long it takes, how much memory, and how many types the definitions
 * make it build.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { measured } from "./metrics.mjs";

/**
 * Type-check the project.
 *
 * @param {{ dir: string, repo: string, endpoints: number }} fixture - The project and the repository
 * @returns {import("./metrics.mjs").Measured[]} The figures
 * @example
 * ```js
 * measureTypecheck({ dir, repo, endpoints: 1000 });
 * ```
 */
export function measureTypecheck({ dir, repo, endpoints }) {
  let output = "";
  try {
    output = execFileSync(
      process.execPath,
      [
        join(repo, "node_modules/typescript/bin/tsc"),
        "-p",
        join(dir, "tsconfig.json"),
        "--noEmit",
        "--extendedDiagnostics",
      ],
      {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 64 * 2 ** 20,
      },
    );
  } catch (error) {
    /* A type error in the project is a figure of its own. */
    output = String(error.stdout ?? "");
  }
  const number = (label) =>
    Number(new RegExp(`${label}:\\s+([\\d.]+)`).exec(output)?.[1] ?? Number.NaN);
  const errors = (output.match(/error TS\d+/g) ?? []).length;
  return [
    measured("tsc.time", number("Total time") * 1000, "ms", 15_000, {
      note: `${number("Files")} files, ${endpoints} endpoints`,
    }),
    measured("tsc.memory", number("Memory used") / 1024, "MB", 1_500),
    measured("tsc.types", number("Types"), "types", 400_000, {
      note: `${number("Instantiations")} instantiations`,
    }),
    measured("tsc.errors", errors, "errors", 0),
  ];
}
