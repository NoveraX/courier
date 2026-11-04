import { codeStyleOf, namedImport, quoted } from "../../edit/code-style";
import { importsOf, usesExport } from "../../edit/imports";
import { addImportLine } from "../../edit/insert";
import { codeMatches, nextCode, type SourceScan, scanSource } from "../../edit/source-scan";
import type { Project } from "../../project/read-project";
import { NEXT_CONFIGS } from "../next-config-edit";
import type { RecipeEdit } from "../recipe-types";
import { firstExisting } from "./config-integration";
import { ROUTES_PURPOSE } from "./routes-plugin";

const PLUGIN = "@noverax/courier-next/plugin";
const EXPORTS = /\bexport\s+default\b|\bmodule\.exports\s*=/g;
/* After these, a line goes on with the expression above it. */
const GOES_ON = /^[.([`?=+\-*/%&|<>,]/;

/*
 * Where the expression a config exports ends: a name, an object, or a name
 * called — `withCourierStudio()(nextConfig)` — at the end of its statement;
 * -1 for anything else: a function, whose object `withCourier()` cannot take.
 */
function exportedEnd(scan: SourceScan, at: number): number {
  const { text } = scan;
  let end: number;
  if (text[at] === "{") end = (scan.closer.get(at) ?? -2) + 1;
  else {
    const name = /^[A-Za-z_$][\w$]*/.exec(text.slice(at))?.[0];
    if (name === undefined || ["function", "async", "class", "new"].includes(name)) return -1;
    end = at + name.length;
    for (let call = nextCode(scan, end); text[call] === "("; call = nextCode(scan, end)) {
      const close = scan.closer.get(call);
      if (close === undefined) return -1;
      end = close + 1;
    }
  }
  if (end <= 0) return -1;
  const after = nextCode(scan, end);
  if (after === -1 || text[after] === ";") return end;
  return text.slice(end, after).includes("\n") && !GOES_ON.test(text.slice(after)) ? end : -1;
}

/* The config with its export passed to `withCourier()`, and the function imported. */
function withRoutesPlugin(text: string): string | undefined {
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const imports = importsOf(scan);
  if (usesExport(scan, imports, (specifier) => specifier === PLUGIN, "withCourier", true))
    return text;
  const exported = codeMatches(scan, EXPORTS);
  const found = exported[0];
  if (exported.length !== 1 || found === undefined) return undefined;
  const at = nextCode(scan, found.index + found[0].length);
  const end = at === -1 ? -1 : exportedEnd(scan, at);
  if (end === -1) return undefined;
  const wrapped = `${text.slice(0, at)}withCourier(${text.slice(at, end)})${text.slice(end)}`;
  const rescanned = scanSource(wrapped);
  if (rescanned === undefined) return undefined;
  const style = codeStyleOf(text);
  const line = found[0].startsWith("module")
    ? `const { withCourier } = require(${quoted(style, PLUGIN)})${style.semi ? ";" : ""}`
    : namedImport(style, ["withCourier"], PLUGIN);
  return addImportLine(rescanned, line);
}

/**
 * The edit that builds a Next.js app's routes in: the config's export
 * passed to `withCourier()`, which adds Courier's rules for Turbopack and
 * webpack. A config written as a function is left to the person: the
 * function's object is the one to pass.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * nextRoutesEdit(project).path; // "next.config.ts"
 * ```
 */
export function nextRoutesEdit(project: Project): RecipeEdit {
  const path = firstExisting(project, NEXT_CONFIGS);
  const commonJs = project.read(path)?.includes("module.exports") === true;
  return {
    path,
    purpose: ROUTES_PURPOSE,
    change: withRoutesPlugin,
    manual: {
      file: path,
      what: "Build the pages' routes in: pass the config's object to withCourier() — in a config written as a function, the object it returns",
      lines: commonJs
        ? [
            `const { withCourier } = require("${PLUGIN}");`,
            "module.exports = withCourier(nextConfig);",
          ]
        : [`import { withCourier } from "${PLUGIN}";`, "export default withCourier(nextConfig);"],
    },
  };
}
