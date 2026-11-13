import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { readAgentFile } from "./agent-rules/agent-file";
import { IMPORT_AGENTS, importsAgents, withAgentsImport } from "./agent-rules/imports-agents";
import {
  AGENT_RULES,
  AGENT_RULES_BEGIN,
  agentRulesProblem,
  withAgentRules,
} from "./agent-rules/rules-text";
import type { Project } from "./project/read-project";
import type {
  AgentRulesFile,
  ManualStep,
  Recipe,
  RecipeContext,
  RecipeEdit,
  RecipeFile,
} from "./recipes/recipe-types";
import { courierPackage } from "./recipes/shared/packages";

const AGENTS = "AGENTS.md";
/* The file one editor's agent reads in place of AGENTS.md: a line of it reads AGENTS.md. */
const OWN_RULES = "CLAUDE.md";
const DOCS = "@noverax/courier-docs";
const BLOCK = AGENT_RULES.split("\n");
const POINTS = "points your editor's agent at the docs of the Courier you install";
const NEXT =
  "Your editor's agent reads the docs of the Courier you install, in node_modules/@noverax/courier-docs/docs, as AGENTS.md tells it";

/* What becomes of one file of the agents' rules: its state, and the file to add, the change to make or the step left to the person. */
interface Part {
  readonly file: AgentRulesFile;
  readonly add?: RecipeFile;
  readonly edit?: RecipeEdit;
  readonly manual?: ManualStep;
}

function kept(path: string, why: string, todo: string, lines: readonly string[]): Part {
  const what = `${why.charAt(0).toUpperCase()}${why.slice(1)}, so it was left as it is: ${todo}`;
  return { file: { path, state: "kept" }, manual: { file: path, what, lines } };
}

/* What to do with an AGENTS.md the block's rules leave as it is. */
const AGENTS_LEFT: Readonly<Record<string, string>> = {
  "it is a link": "add Courier's block to the end of the file it leads to",
  "it is not a file": "Courier's block goes into a file of this name",
};

/* AGENTS.md: added with the block, the block added to its end or brought up to date, or the file left as it is. */
function agentsPart(root: string): Part {
  const read = readAgentFile(join(root, AGENTS));
  if (read.kind === "none") {
    const purpose = `Courier's block, which ${POINTS}`;
    return {
      file: { path: AGENTS, state: "create" },
      add: { path: AGENTS, content: `${AGENT_RULES}\n`, purpose },
    };
  }
  if (read.kind === "left")
    return kept(AGENTS, read.why, AGENTS_LEFT[read.why] ?? "add Courier's block to its end", BLOCK);
  const problem = agentRulesProblem(read.text);
  if (problem !== undefined)
    return kept(
      AGENTS,
      problem,
      "keep one pair of its markers, BEGIN before END, with the block between them",
      BLOCK,
    );
  const there = read.text.includes(AGENT_RULES_BEGIN);
  const state = withAgentRules(read.text) === read.text ? "same" : there ? "update" : "append";
  const edit: RecipeEdit = {
    path: AGENTS,
    purpose: there ? "brings Courier's block up to date" : `adds Courier's block, which ${POINTS}`,
    change: withAgentRules,
    ownLineEnds: true,
    manual: { file: AGENTS, what: "Add Courier's block to its end", lines: BLOCK },
  };
  return { file: { path: AGENTS, state }, edit };
}

/* Whether two paths name one file, links followed. */
function sameFile(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

/* A link at the editor's own file: to AGENTS.md, or to a file that reads it, it reads the block; to any other, the line is the person's to add there. */
function linkedPart(root: string, path: string): Part {
  const target = resolve(root, readlinkSync(path));
  const read = readAgentFile(target, "read");
  if (sameFile(target, join(root, AGENTS)) || (read.kind === "text" && importsAgents(read.text)))
    return { file: { path: OWN_RULES, state: "same" } };
  return kept(OWN_RULES, "it is a link", "the file it leads to reads AGENTS.md with this line", [
    IMPORT_AGENTS,
  ]);
}

/* The editor's own file: added with the line that reads AGENTS.md, the line added to its end, or the file left as it is. */
function ownRulesPart(root: string): Part {
  const path = join(root, OWN_RULES);
  if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true)
    return linkedPart(root, path);
  const read = readAgentFile(path);
  if (read.kind === "none") {
    const purpose = "reads AGENTS.md, for the agent that reads this file in its place";
    return {
      file: { path: OWN_RULES, state: "create" },
      add: { path: OWN_RULES, content: `${IMPORT_AGENTS}\n`, purpose },
    };
  }
  if (read.kind === "left")
    return kept(OWN_RULES, read.why, "add this line to it, so that it reads AGENTS.md", [
      IMPORT_AGENTS,
    ]);
  const edit: RecipeEdit = {
    path: OWN_RULES,
    purpose: "reads AGENTS.md, Courier's block with it",
    change: withAgentsImport,
    ownLineEnds: true,
    manual: {
      file: OWN_RULES,
      what: "Add this line to it, so that it reads AGENTS.md",
      lines: [IMPORT_AGENTS],
    },
  };
  return { file: { path: OWN_RULES, state: importsAgents(read.text) ? "same" : "append" }, edit };
}

/* AGENTS.md's part, and the editor's own file's where AGENTS.md is a file of its own: through a link, the line could have a file read itself. */
function partsOf(root: string): Part[] {
  const agents = lstatSync(join(root, AGENTS), { throwIfNoEntry: false });
  const own = agents === undefined || agents.isFile();
  return own ? [agentsPart(root), ownRulesPart(root)] : [agentsPart(root)];
}

/**
 * A recipe with what pointing the agent in the editor at the docs adds,
 * where the person agreed: `@noverax/courier-docs`, which holds the docs
 * of the Courier the project installs; Courier's block in AGENTS.md, which
 * points the agent at them — AGENTS.md added with it, or the block added
 * to its end or brought up to date between its markers; and the line that
 * has the file another editor's agent reads in its place read AGENTS.md.
 * A file the block's rules leave as it is — a link, one over 1 MiB, one
 * whose markers are repeated — is the person's, with a step that says why.
 *
 * @param ctx - The project, and what is set up in it
 * @param recipe - The recipe so far
 * @returns The recipe, with the agents' docs where asked for
 * @example
 * ```ts
 * withAgentDocs(ctx, recipe).agentRules; // [{ path: "AGENTS.md", state: "append" }, …]
 * ```
 */
export function withAgentDocs(ctx: RecipeContext, recipe: Recipe): Recipe {
  if (!ctx.choices.agentRules) return recipe;
  const parts = partsOf(ctx.project.root);
  return {
    ...recipe,
    files: [...recipe.files, ...parts.flatMap((part) => (part.add ? [part.add] : []))],
    edits: [...recipe.edits, ...parts.flatMap((part) => (part.edit ? [part.edit] : []))],
    devDependencies: [...recipe.devDependencies, courierPackage(DOCS)],
    manual: [...recipe.manual, ...parts.flatMap((part) => (part.manual ? [part.manual] : []))],
    next: [...recipe.next, { command: "", what: NEXT }],
    agentRules: parts.map((part) => part.file),
  };
}

/**
 * Whether pointing the editor's agent at the docs would change anything
 * in a project: it lists no `@noverax/courier-docs`, or a file of the
 * agents' rules lacks what the setup writes there. Where nothing would,
 * nobody is asked.
 *
 * @param project - The project
 * @returns `true` where the setup has something to do for it
 * @example
 * ```ts
 * agentDocsWanted(readProject("/work/shop")); // true in a project without the docs
 * ```
 */
export function agentDocsWanted(project: Project): boolean {
  return !project.lists(DOCS) || partsOf(project.root).some((part) => part.file.state !== "same");
}
