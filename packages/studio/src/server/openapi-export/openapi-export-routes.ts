import { type SkippedEndpoint, toOpenAPI } from "@noverax/courier/openapi";
import { messageOf } from "@noverax/courier-cli/devkit";
import { ownValue } from "../../apis/own-value";
import type { ProjectState } from "../project-state/types";
import type { RouteApp } from "../route-types";
import { isObject } from "../validate-body";

/** What the export route reads: the project as Studio runs it. */
export interface OpenApiExportDeps {
  project: Pick<ProjectState, "snapshot">;
}

/* The keys of a path item that are operations, as OpenAPI 3.1 and 3.2 name them. */
const OPERATIONS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);
/* A title or an API version is a line of text, not a file. */
const LONGEST_FIELD = 200;

/**
 * Mount the route that writes a source as an OpenAPI document, as
 * `courier-studio openapi` writes it, for the APIs page to download or copy:
 *
 * POST /api/openapi/document — `{ source, openapi?, title?, version? }` → `{ text, fileName, operations, leftOut }`
 *
 * It reads the definition Studio runs, and writes nothing: the document is
 * the answer's, with every endpoint it leaves out — a channel, say — and why.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project Studio runs
 * @example
 * ```ts
 * registerOpenApiExportRoutes(app, { project });
 * ```
 */
export function registerOpenApiExportRoutes(app: RouteApp, { project }: OpenApiExportDeps): void {
  app.post("/api/openapi/document", (req, res) => {
    const asked = askedDocument(req.body);
    if (typeof asked === "string") {
      res.status(400).json({ error: asked });
      return;
    }
    const sources = project.snapshot().running?.config.sources;
    if (!sources) {
      res.status(409).json({ error: "Studio has not loaded courier.config yet." });
      return;
    }
    const source = ownValue(sources, asked.source);
    if (typeof source !== "object" || source === null) {
      const names = Object.keys(sources).join(", ") || "none";
      res.status(404).json({
        error: `courier.config declares no source "${asked.source}" — it declares ${names}.`,
      });
      return;
    }
    const leftOut: SkippedEndpoint[] = [];
    try {
      const document = toOpenAPI(source, {
        openapi: asked.openapi,
        info: {
          ...(asked.title && { title: asked.title }),
          ...(asked.version && { version: asked.version }),
        },
        onSkip: (skipped) => leftOut.push(skipped),
      });
      const operations = Object.values(document.paths).reduce(
        (sum, route) => sum + Object.keys(route ?? {}).filter((key) => OPERATIONS.has(key)).length,
        0,
      );
      res.json({
        text: `${JSON.stringify(document, null, 2)}\n`,
        fileName: `${asked.source}.openapi.json`,
        operations,
        leftOut,
      });
    } catch (error) {
      res
        .status(422)
        .json({ error: `No document could be written for ${asked.source}: ${messageOf(error)}` });
    }
  });
}

interface AskedDocument {
  source: string;
  openapi: "3.1.0" | "3.2.0";
  title: string | undefined;
  version: string | undefined;
}

function askedDocument(body: unknown): AskedDocument | string {
  const { source, openapi = "3.1.0", title, version } = isObject(body) ? body : {};
  if (typeof source !== "string" || source === "")
    return "Name the source: { source, openapi?, title?, version? }.";
  if (openapi !== "3.1.0" && openapi !== "3.2.0")
    return `openapi is 3.1.0 or 3.2.0, not ${String(openapi)}.`;
  if (!isLine(title)) return `title is a line of at most ${LONGEST_FIELD} characters.`;
  if (!isLine(version)) return `version is a line of at most ${LONGEST_FIELD} characters.`;
  return { source, openapi, title: filled(title), version: filled(version) };
}

function isLine(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= LONGEST_FIELD);
}

function filled(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
