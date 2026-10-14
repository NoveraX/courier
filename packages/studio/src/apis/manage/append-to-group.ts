/**
 * Appends new endpoints to an existing group file, or to a flat import's
 * source, keeping every line the file already has.
 */

import { parseSource } from "@noverax/courier-cli/devkit";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { detectStyle } from "../../server/mocks-edit/plan/detect-style";
import { insertion } from "../../server/mocks-edit/plan/insertion";
import { planListInsertion } from "../../server/mocks-edit/plan/list-insertion";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import type { TextEdit } from "../../server/mocks-edit/types";
import { parseExistingGroup } from "../merge/parse-existing";
import { renameBase, usesBase } from "../merge/rename-base";
import { aboveStatement } from "./above-statement";
import { EndpointOutsidePrefixError } from "./endpoint-outside-prefix-error";
import { fileBase } from "./file-base";
import { type GeneratedEntry, generatedEndpoints } from "./generated-entries";
import { endpointNames, findGroupDeclaration } from "./group-declaration";
import { planMissingImports } from "./plan-missing-imports";
import { entryUrl, pathSegments, rebaseEntryPath } from "./rebase-entry-path";
import { referencedImports } from "./referenced-imports";
import { streamBase } from "./stream-base";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/** The name a generated file builds its streams of events from. */
const STREAM = "stream";

/* An entry as a list takes it: its lines after the first at `indent`. */
function entryText({ comment, code }: GeneratedEntry, indent: string, eol: string): string {
  const lines = [...(comment === null ? [] : comment.split("\n")), ...code.split("\n")];
  return lines.map((line, i) => (i === 0 ? line : `${indent}${line}`)).join(eol);
}

/**
 * Add endpoints to a file that declares them, reading it as code: the new
 * endpoints go after the last entry of its `endpoints`, in its layout, and
 * the file imports what they need that it does not bind already. Every
 * other character stays as it is — comments, spreads and endpoints the user
 * wrote, how the base is named, the code after the declaration. Of several
 * declarations, the one named as generated is added to. The base is
 * declared as generated, above the declaration and its comments, only when
 * the file names none; only names the added code uses are imported. An
 * endpoint the file has already is not added again.
 *
 * @param path - The file, project-relative, to name in a refusal
 * @param existingContent - Current file on disk
 * @param generatedContent - Freshly generated file with the new endpoints
 * @param endpointNames - Names of endpoints to take from the generated file
 * @returns Merged file content; `existingContent` when nothing is new
 * @throws {UnrecognizedFileError} When the file does not parse, or declares no endpoints object
 * @throws {EndpointOutsidePrefixError} When an added endpoint's URL is not under the prefix the file declares, or Studio cannot read that prefix
 * @example
 * ```ts
 * appendEndpointsToGroup("src/api/pets/pets/index.ts", onDisk, generated, ["createPet"]);
 * ```
 */
export function appendEndpointsToGroup(
  path: string,
  existingContent: string,
  generatedContent: string,
  endpointNamesToAdd: string[],
): string {
  const generated = parseExistingGroup(generatedContent);
  const { declaration: name, entries } = generatedEndpoints(generatedContent);
  const parsed = parseSource(path, existingContent);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program, name) : null;
  if (declaration === null) throw new UnrecognizedFileError(path);
  const present = endpointNames(declaration.endpoints);
  const wanted = new Set(endpointNamesToAdd);
  const added = [...entries].filter(([key]) => wanted.has(key) && !present.has(key));
  if (added.length === 0) return existingContent;

  const bindings = collectModuleBindings(parsed.program);
  const style = detectStyle(parsed, declaration.endpoints);
  const fileBaseName = fileBase(parsed.program) ?? (bindings.has("endpoint") ? "endpoint" : null);
  const base = fileBaseName ?? generated.baseName;
  /* A file generated before streams were names no stream builder; the
     generated declaration, taken whole when the file names no base, does. */
  const streams = added.some(([, entry]) => usesBase(entry.code, STREAM));
  const stream =
    streams && fileBaseName !== null
      ? streamBase(parsed, bindings)
      : { base: STREAM, edit: null, line: null };
  /* A path is written relative to the prefix it was generated under; the file's may differ. */
  const fresh = findGroupDeclaration(parseSource("generated.ts", generatedContent).program, name);
  const generatedPrefix = fresh?.prefix ?? "";
  const bases = [base, stream.base];
  const texts = added.map(([key, entry]) => {
    const code = renameBase(renameBase(entry.code, generated.baseName, base), STREAM, stream.base);
    return {
      ...entry,
      code: underPrefix(path, key, code, bases, generatedPrefix, declaration.prefix),
    };
  });
  const preamble = fileBaseName === null ? generated.preamble.join(style.eol) : (stream.line ?? "");
  const referenced = [preamble, ...texts.map((t) => t.code)].join("\n");
  const edits: TextEdit[] = [
    ...planMissingImports(
      parsed,
      referencedImports(generated.imports, referenced),
      bindings,
      style,
    ),
  ];
  if (stream.edit !== null) edits.push(stream.edit);
  if (preamble !== "")
    edits.push(
      insertion(
        aboveStatement(parsed, declaration.statement.start),
        `${preamble}${style.eol}${style.eol}`,
      ),
    );
  const { endpoints } = declaration;
  const list = { open: endpoints.start, close: endpoints.end - 1, items: endpoints.properties };
  const { comments, commentEnds } = parsed;
  const site = { text: existingContent, comments, commentEnds, style, singleLineFile: false };
  edits.push(
    ...planListInsertion(list, site, (indent) => texts.map((t) => entryText(t, indent, style.eol))),
  );
  return applyEdits(
    existingContent,
    [...edits].sort((a, b) => a.start - b.start),
  );
}

/* The entry with its path relative to the file's prefix, when the two prefixes differ. */
function underPrefix(
  path: string,
  key: string,
  code: string,
  bases: readonly string[],
  generatedPrefix: string,
  filePrefix: string | null,
): string {
  const same =
    filePrefix !== null &&
    pathSegments(filePrefix).join("/") === pathSegments(generatedPrefix).join("/");
  if (same) return code;
  const rebased =
    filePrefix === null ? null : rebaseEntryPath(code, bases, generatedPrefix, filePrefix);
  if (rebased !== null) return rebased;
  throw new EndpointOutsidePrefixError(
    path,
    key,
    entryUrl(code, bases, generatedPrefix) ?? "",
    filePrefix,
  );
}
