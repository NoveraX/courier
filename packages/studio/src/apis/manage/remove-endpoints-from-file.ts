import { parseSource } from "@noverax/courier-cli/devkit";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { dropUnusedImports } from "./drop-unused-imports";
import { planEntryRemoval } from "./entry-removal";
import { findGroupDeclaration } from "./group-declaration";
import { UnrecognizedFileError } from "./unrecognized-file-error";
import { groupsObject } from "./update-group-file";

/** What removing endpoints from a file leaves, and what it took. */
export interface EndpointRemoval {
  /** The file without them; `null` when it declared nothing else, and goes. */
  content: string | null;
  /** The code of each endpoint removed. */
  removedCode: string[];
}

/**
 * Remove endpoints from a file that declares them, reading it as code:
 * each goes with its doc comment and its comma, and the names only it
 * used go from the imports. Every other character stays as it is — the
 * code naming the base, the endpoints and comments left, the code after
 * the declaration.
 *
 * @param path - The file, project-relative, for the parser and a refusal
 * @param content - The file as it is
 * @param names - The endpoints to remove
 * @param options - `keepEmpty` keeps a file whose endpoints would all go, as a flat import's source
 * @returns The file without them, or `null` when nothing else is left in its endpoints, and the code removed
 * @throws {UnrecognizedFileError} When the file does not parse, or declares no endpoints object
 * @example
 * ```ts
 * removeEndpointsFromFile("src/api/pets/pets/index.ts", onDisk, ["deletePet"]).content;
 * ```
 */
export function removeEndpointsFromFile(
  path: string,
  content: string,
  names: readonly string[],
  { keepEmpty = false }: { keepEmpty?: boolean } = {},
): EndpointRemoval {
  const parsed = parseSource(path, content);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program) : null;
  if (declaration === null) throw new UnrecognizedFileError(path);
  const { properties, start } = declaration.endpoints;
  const wanted = new Set(names);
  const indices = new Set<number>();
  properties.forEach((property, at) => {
    if (
      property.type === "Property" &&
      !property.computed &&
      wanted.has(propertyKeyName(property.key) ?? "")
    )
      indices.add(at);
  });
  const removedCode = [...indices].map((at) =>
    content.slice(properties[at]?.start ?? 0, properties[at]?.end ?? 0),
  );
  if (indices.size === 0) return { content, removedCode };
  /* A group that holds groups stays, its endpoints gone, so they keep a group to sit in. */
  const holdsGroups = (groupsObject(declaration.config)?.properties.length ?? 0) > 0;
  if (indices.size === properties.length && !keepEmpty && !holdsGroups) {
    return { content: null, removedCode };
  }
  const without = applyEdits(content, planEntryRemoval(parsed, properties, start, indices));
  const used = new Set(removedCode.flatMap((code) => code.match(/[A-Za-z_$][\w$]*/g) ?? []));
  return { content: dropUnusedImports(path, without, used), removedCode };
}
