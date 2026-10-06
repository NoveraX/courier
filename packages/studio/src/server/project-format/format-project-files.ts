import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { type FormatterTool, findFormatters, type ProjectFormatters } from "./find-formatters";
import { formatInThread } from "./formatter-host";
import { runBiome } from "./run-biome";

const log = createLogger("Studio");

/* Files formatted at once: Biome runs as a process for each. */
const PARALLEL = 8;
/* Biome does not always reach its own layout in one pass: a comment inside a type
   argument moves again on the second; and one tool's fixes may move what another
   laid out. A file goes through the tools until it stops changing. */
const PASSES = 3;

/** A file Studio composed, by its project-relative path. */
export interface ComposedFile {
  path: string;
  content: string;
}

/** What formatting a set of files came to. */
export interface FormatOutcome<TFile extends ComposedFile> {
  /** The files, each formatted, or as composed where a tool failed on it. */
  files: TFile[];
  /** The tools that formatted them, with their versions: `["Biome 2.5.14"]`; none when the project has none. */
  formattedWith: string[];
  /** Why a file, or every file, was left as composed; `null` when nothing was. */
  problem: string | null;
}

/**
 * Format files Studio composed as the project formats its code, before
 * anything reads, shows or signs them: with the Biome, the ESLint and the
 * Prettier the project installed, its own configuration and ignore files.
 * ESLint and Prettier stay loaded between files and between changes, so a
 * file takes milliseconds. A project that uses none of them gets the files
 * as composed. A file a tool fails on keeps the text it had, and the
 * failure is reported, never thrown: a file that is not formatted is still
 * correct code.
 *
 * @param root - The project root, symlinks resolved
 * @param files - The files, by project-relative path
 * @param formatters - The project's formatters; found from the root when not given
 * @returns The files, the tools that formatted them, and what went wrong
 * @example
 * ```ts
 * const { files } = await formatProjectFiles(root.path, generateCode(spec, options, name));
 * ```
 */
export async function formatProjectFiles<TFile extends ComposedFile>(
  root: string,
  files: readonly TFile[],
  formatters: ProjectFormatters = findFormatters(root),
): Promise<FormatOutcome<TFile>> {
  const { tools, missing } = formatters;
  /* The tools that format the project's code, whether or not these files needed them. */
  const formattedWith = tools.map((tool) => `${tool.name} ${tool.version}`);
  if (tools.length === 0 || files.length === 0) {
    return { files: [...files], formattedWith, problem: files.length > 0 ? missing : null };
  }
  let problem: string | null = missing;
  const formatOne = async (file: TFile): Promise<TFile> => {
    const path = resolve(root, file.path);
    const { content, failure } = await settled(formatters, path, file.content, root);
    if (failure !== null) {
      log.debug(`${file.path} was not formatted with ${failure}`);
      problem ??= `${file.path} was not formatted with ${failure}`;
    }
    return content === file.content ? file : { ...file, content };
  };
  return { files: await inParallel(files, formatOne), formattedWith, problem };
}

/* A text after one tool: Biome as its own program, ESLint and Prettier in the project's threads. */
function runTool(
  tool: FormatterTool,
  path: string,
  text: string,
  root: string,
  stamp: string,
): Promise<string> {
  if (tool.name === "Biome") return runBiome(tool.command, path, text, root);
  return formatInThread(root, stamp, { tool: tool.name, module: tool.module, root, path, text });
}

/* The text as the tools leave it once another pass through them changes nothing. A tool
   that fails on the file is left out of the rest, and the others still run: a pass is
   confirmed where Biome runs, which does not always settle in one, or tools follow each
   other. */
async function settled(
  { tools, stamp }: ProjectFormatters,
  path: string,
  text: string,
  root: string,
): Promise<{ content: string; failure: string | null }> {
  const failed = new Set<FormatterTool>();
  let failure: string | null = null;
  const passes = tools.length > 1 || tools.some((tool) => tool.name === "Biome") ? PASSES : 1;
  let current = text;
  for (let pass = 0; pass < passes; pass++) {
    let next = current;
    for (const tool of tools.filter((each) => !failed.has(each))) {
      try {
        next = await runTool(tool, path, next, root, stamp);
      } catch (error) {
        failed.add(tool);
        failure ??= `${tool.name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (next === current) break;
    current = next;
  }
  return { content: current, failure };
}

/* Each item through `run`, at most PARALLEL at a time, results in the items' order. */
async function inParallel<TItem, TResult>(
  items: readonly TItem[],
  run: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as TItem);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return results;
}
