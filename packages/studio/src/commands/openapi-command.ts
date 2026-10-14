import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { type OpenAPIOptions, toOpenAPI } from "@noverax/courier/openapi";
import { DOTENV_ARG, loadProjectEnv } from "@noverax/courier-cli/devkit";
import { type ArgsDef, defineCommand } from "citty";
import { loadCourierConfig } from "../server/config-loader";

const log = createLogger("Openapi");

/** The `openapi` command's options. */
export const OPENAPI_ARGS = {
  source: {
    type: "string",
    valueHint: "name",
    description: "The source in courier.config.ts to write (default: every source)",
  },
  out: {
    type: "string",
    valueHint: "path",
    description: "A file for one source, a folder for several (default: print one to the terminal)",
  },
  openapi: {
    type: "string",
    valueHint: "version",
    description: "3.1.0 (default), or 3.2.0 for QUERY, stream events and nested tags",
  },
  title: {
    type: "string",
    valueHint: "title",
    description: "The document's title (default: the source's name)",
  },
  "api-version": {
    type: "string",
    valueHint: "version",
    description: "The API's version the document states (default: 0.0.0)",
  },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  dotenv: DOTENV_ARG,
} as const satisfies ArgsDef;

/**
 * `courier-studio openapi` — write the project's sources as OpenAPI
 * documents, read from `courier.config.ts` as Studio reads it. One source
 * prints to the terminal or goes to `--out`; several go to the folder
 * `--out` names, one `<source>.openapi.json` each. Every endpoint a document
 * leaves out — a channel, say — is said in the log, with why.
 *
 * @example
 * ```sh
 * courier-studio openapi --source billing --api-version 2.4.0 --out openapi.json
 * ```
 */
export const openapiCommand = defineCommand({
  meta: { name: "openapi", description: "Write the project's sources as OpenAPI documents" },
  args: OPENAPI_ARGS,
  async run({ args }) {
    try {
      await writeDocuments(args);
    } catch (error) {
      /* One line naming the problem, as the server's own start does, and a failing status. */
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});

async function writeDocuments(args: {
  source?: string | undefined;
  out?: string | undefined;
  openapi?: string | undefined;
  title?: string | undefined;
  "api-version"?: string | undefined;
  cwd?: string | undefined;
  dotenv?: string | undefined;
}): Promise<void> {
  const version = args.openapi ?? "3.1.0";
  if (version !== "3.1.0" && version !== "3.2.0") {
    throw new Error(`--openapi takes 3.1.0 or 3.2.0, not ${version}`);
  }
  const root = resolve(args.cwd ?? process.cwd());
  loadProjectEnv(root, args.dotenv);
  const { config } = await loadCourierConfig(root);
  const names = args.source === undefined ? Object.keys(config.sources) : [args.source];
  const unknown = names.find((name) => !Object.hasOwn(config.sources, name));
  if (unknown !== undefined) {
    throw new Error(
      `courier.config.ts has no source "${unknown}" — it has ${Object.keys(config.sources).join(", ")}`,
    );
  }
  if (names.length > 1 && args.out === undefined) {
    throw new Error(
      "Several sources go to a folder: name one with --source, or a folder with --out",
    );
  }
  for (const name of names) {
    const options: OpenAPIOptions = {
      openapi: version,
      info: {
        ...(args.title && { title: args.title }),
        ...(args["api-version"] && { version: args["api-version"] }),
      },
      onSkip: ({ operation, reason }) => log.warn(`${name}.${operation} is left out: ${reason}`),
    };
    const text = `${JSON.stringify(toOpenAPI(config.sources[name] as object, options), null, 2)}\n`;
    written(text, names.length > 1 && args.out ? join(args.out, `${name}.openapi.json`) : args.out);
  }
}

function written(text: string, out: string | undefined): void {
  if (out === undefined) {
    process.stdout.write(text);
    return;
  }
  const file = resolve(out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  log.info(`Wrote ${file}`);
}
