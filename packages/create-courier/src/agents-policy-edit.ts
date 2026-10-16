import { configObjectPath } from "./project/config-file";
import type { Project } from "./project/read-project";
import type { RecipeEdit } from "./recipes/recipe-types";

/** What `--mcp` offers agents: every read, and a write once it is marked `.agent()`. */
export const READS_POLICY = 'agents: { offer: "reads" }';

/* Where the config's object opens: `defineConfig({`, or `export default {` in a config written without it. */
const OBJECT_OPENING = /defineConfig\(\s*\{|export\s+default\s*\{/;
/* A config that says already what agents may call, whatever it says. */
const HAS_POLICY = /(^|[\s,{])agents\s*:/m;

/**
 * The change `--mcp` makes to a config the project has already: its
 * object offers agents every read. A config that names `agents` already
 * is left as it is — what agents may call is the project's to say — and
 * one whose object it cannot find is the person's to change.
 *
 * @param project - The project, set up before
 * @returns The edit
 * @example
 * ```ts
 * agentsPolicyEdit(project).change("export default defineConfig({\n  sources: { api },\n});\n");
 * // 'export default defineConfig({\n  agents: { offer: "reads" },\n  sources: { api },\n});\n'
 * ```
 */
export function agentsPolicyEdit(project: Project): RecipeEdit {
  const path = configObjectPath(project);
  return {
    path,
    purpose: "offers agents the API's reads",
    change: withReadsPolicy,
    manual: {
      file: path,
      what: "the MCP server offers agents what the config's agents policy names: add it to the object the config exports",
      lines: [`${READS_POLICY},`],
    },
  };
}

function withReadsPolicy(text: string): string | undefined {
  if (HAS_POLICY.test(text)) return text;
  const opening = OBJECT_OPENING.exec(text);
  if (opening === null) return undefined;
  const at = opening.index + opening[0].length;
  const rest = text.slice(at);
  const sameLine = /^[ \t]*[^\s]/.test(rest);
  if (sameLine) return `${text.slice(0, at)} ${READS_POLICY},${rest}`;
  const indent = /\n([ \t]+)\S/.exec(rest)?.[1] ?? "  ";
  return `${text.slice(0, at)}\n${indent}${READS_POLICY},${rest}`;
}
