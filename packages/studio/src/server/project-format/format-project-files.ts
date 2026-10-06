import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { type FormatterTool, findFormatters, type ProjectFormatters } from "./find-formatters";
import { runFormatter } from "./run-formatter";

const log = createLogger("Studio");

/* Files formatted at once: each is a process of its own. */
const PARALLEL = 8;
/* Biome does not always reach its own layout in one pass: a comment inside a type
   argument moves again on the second. A file is formatted until it stops changing. */
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
 * anything reads, shows or signs them: with the Biome and the Prettier the
 * project installed, its own configuration and ignore files. A project
 * that formats with neither gets the files as composed. A file a tool fails
 * on keeps the text it had, and the failure is reported, never thrown: a
 * file that is not formatted is still correct code.
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
    let content = file.content;
    try {
      for (const tool of tools)
        content = await settled(tool, resolve(root, file.path), content, root);
    } catch (error) {
      log.debug(`${file.path} is left as composed`, error);
      problem ??= `${file.path} was not formatted: ${error instanceof Error ? error.message : String(error)}`;
      return file;
    }
    return content === file.content ? file : { ...file, content };
  };
  return { files: await inParallel(files, formatOne), formattedWith, problem };
}

/* The text as the tool leaves it once another pass changes nothing. */
async function settled(
  tool: FormatterTool,
  path: string,
  text: string,
  root: string,
): Promise<string> {
  let current = text;
  for (let pass = 0; pass < PASSES; pass++) {
    const next = await runFormatter(tool, path, current, root);
    if (next === current) break;
    current = next;
  }
  return current;
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
