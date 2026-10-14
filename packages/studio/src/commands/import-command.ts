import { createLogger } from "@noverax/courier";
import { DOTENV_ARG } from "@noverax/courier-cli/devkit";
import { type ArgsDef, defineCommand } from "citty";
import { runImport } from "./import/run-import";

const log = createLogger("Import");

/** The `import` command's options. */
export const IMPORT_ARGS = {
  spec: {
    type: "positional",
    required: true,
    valueHint: "spec",
    description: "The specification: a URL, a file, or - for standard input",
  },
  name: {
    type: "string",
    valueHint: "name",
    description: "The import's name, which its source takes (default: from the specification)",
  },
  out: {
    type: "string",
    valueHint: "dir",
    description: "The folder the import's own folder goes in (default: src/api)",
  },
  validation: {
    type: "string",
    valueHint: "zod|valibot|arktype|none",
    description: "The schemas that check each call (default: zod)",
  },
  "group-by": {
    type: "string",
    valueHint: "tag|path|single",
    description: "How the endpoints are grouped (default: tag)",
  },
  client: {
    type: "string",
    valueHint: "direct|proxy|both|none",
    description: "The callers generated (default: direct)",
  },
  include: {
    type: "string",
    valueHint: "tag:a,path:/b,op:c",
    description: "Only these endpoints, by tag, path or operationId",
  },
  exclude: {
    type: "string",
    valueHint: "tag:a,path:/b,op:c",
    description: "Leave these endpoints out",
  },
  types: {
    type: "boolean",
    default: true,
    description: "Generate types; --no-types to leave them out",
  },
  schemas: {
    type: "boolean",
    default: true,
    description: "Generate schemas; --no-schemas to leave them out",
  },
  comments: {
    type: "boolean",
    default: true,
    description:
      "Keep the specification's descriptions as comments; --no-comments to leave them out",
  },
  "auth-middleware": {
    type: "boolean",
    description: "Add middleware that sends the credentials the specification names",
  },
  declare: {
    type: "boolean",
    default: true,
    description: "Declare the import in courier.config.ts; --no-declare to only write its files",
  },
  confirm: {
    type: "string",
    valueHint: "paths",
    description: "Allow these steps that wait for consent too, by path, comma-separated",
  },
  yes: {
    type: "boolean",
    alias: "y",
    description: "Write without asking (-y), as Import API offers the plan",
  },
  "dry-run": { type: "boolean", description: "Show what the import writes, and write nothing" },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  dotenv: DOTENV_ARG,
} as const satisfies ArgsDef;

/**
 * `courier-studio import` — turn an OpenAPI 3, Swagger 2 or Postman
 * specification into typed API code, as Import API does on Studio's APIs
 * page: the plan shown first, the files written as the person allows, and
 * the import declared in `courier.config.ts`.
 *
 * @example
 * ```sh
 * npx @noverax/courier-studio import https://petstore3.swagger.io/api/v3/openapi.json --yes
 * ```
 */
export const importCommand = defineCommand({
  meta: { name: "import", description: "Turn an API specification into typed code" },
  args: IMPORT_ARGS,
  async run({ args }) {
    try {
      process.exitCode = await runImport(args.spec, args);
    } catch (error) {
      /* One line naming the problem, as the server's own start does, and a failing status. */
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});
