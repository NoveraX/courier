/**
 * semantic-release's notes for a release: those written for it by hand,
 * where there are some, and otherwise those its commits make.
 *
 * A release that deserves more than a list of commits — the first, a major
 * — has its notes written in `.github/release-notes/v<version>.md`. They go
 * to the GitHub release, the changelog and the release commit under the
 * same heading the generated notes have, in place of the list. Every other
 * release lists its commits as the conventional commits preset does, but
 * for those whose scopes are all in `leaveOut`: work on the site, the
 * examples or the repository's tooling, which changes no package.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateNotes as notesFromCommits } from "@semantic-release/release-notes-generator";

/**
 * The notes for the next release.
 *
 * @param {{ leaveOut?: string[] } & Record<string, unknown>} pluginConfig - The release notes generator's options, and the scopes whose commits the notes leave out
 * @param {{ cwd: string, commits: Array<{ message: string }>, nextRelease: { version: string } }} context - The release, as semantic-release hands it over
 * @returns {Promise<string>} The notes, Markdown
 * @example
 * // .github/release-notes/v0.1.0.md holds the notes written for 0.1.0
 * await generateNotes({ preset: "conventionalcommits", leaveOut: ["site"] }, context);
 * // → "## [0.1.0](…) (2026-10-12)\n\nCourier's first public release. …"
 */
export async function generateNotes({ leaveOut = [], ...pluginConfig }, context) {
  const commits = context.commits.filter((commit) => !internal(commit.message, leaveOut));
  const generated = await notesFromCommits(pluginConfig, { ...context, commits });
  const written = join(
    context.cwd,
    ".github",
    "release-notes",
    `v${context.nextRelease.version}.md`,
  );
  if (!existsSync(written)) return generated;
  const heading = generated.split("\n").find((line) => line.startsWith("#")) ?? "";
  return `${heading}\n\n${readFileSync(written, "utf8").trim()}\n`.trimStart();
}

/* A commit every scope of which is one the notes leave out; one with no scope is the packages'. */
function internal(message, leaveOut) {
  const scopes = /^\w+\(([^)]+)\)!?:/.exec(message)?.[1]?.split(",") ?? [];
  return scopes.length > 0 && scopes.every((scope) => leaveOut.includes(scope.trim()));
}
