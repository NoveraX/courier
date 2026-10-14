import { createLogger } from "@noverax/courier";
import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { IdentifierName, IdentifierReference, ObjectExpression, Span } from "oxc-parser";
import { Visitor } from "oxc-parser";
import { MocksEditRefusal } from "../mocks-edit/mocks-edit-refusal";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import { readEditable } from "../mocks-edit/plan/read-editable";
import { textOf } from "../mocks-edit/plan/text-of";
import { sha256Hex } from "../sha256-hex";
import { createClosureDigests } from "./closure-digests";
import type { TopLevel } from "./top-level-bindings";
import { topLevelBindings } from "./top-level-bindings";

const log = createLogger("Studio");

type Identifier = Pick<IdentifierReference | IdentifierName, "name" | "start" | "end">;

/**
 * A fingerprint of each mock a mocks file declares, by key: it changes when
 * the declaration does, or anything the declaration uses — a declaration
 * beside it, an import and every module that import reaches, a statement of
 * the file that declares nothing — and stays when only another mock's does.
 *
 * `null` when Studio cannot tell one declaration from another: the file does
 * not parse, is CommonJS, or its mocks are not an object literal whose keys
 * can all be read. Every mock then counts as changed on each load.
 *
 * @param mocksFile - The mocks file's path, which its imports resolve from
 * @param text - Its text
 * @returns The fingerprint of each key, or `null`
 * @example
 * ```ts
 * const before = fingerprintMocks(file, oldText);
 * const after = fingerprintMocks(file, newText);
 * before?.get("users") === after?.get("users"); // → true when only "orders" was edited
 * ```
 */
export function fingerprintMocks(
  mocksFile: string,
  text: string,
): ReadonlyMap<string, string> | null {
  const parsed = readMocks(mocksFile, text);
  if (parsed === null) return null;
  const { editable, object } = parsed;
  const identifiers = collectIdentifiers(editable);
  const top = topLevelBindings(editable.program.body);
  const digestOf = createClosureDigests(mocksFile);
  const shared = sharedPart(editable, object, top, digestOf);
  const fingerprints = new Map<string, string>();
  for (const property of object.properties) {
    if (property.type !== "Property") continue;
    const key = propertyKeyName(property.key);
    if (key === null) continue;
    const used = usedPart(editable, property.value, identifiers, top, digestOf);
    const earlier = fingerprints.get(key) ?? "";
    fingerprints.set(
      key,
      sha256Hex([earlier, shared, textOf(editable, property.value), ...used].join("\n")),
    );
  }
  return fingerprints;
}

/* A file Studio would not edit is one it cannot split into declarations either. */
function readMocks(
  mocksFile: string,
  text: string,
): { editable: ParsedSource; object: ObjectExpression } | null {
  try {
    const { parsed, located } = readEditable(mocksFile, text);
    return located.kind === "object" ? { editable: parsed, object: located.object } : null;
  } catch (error) {
    if (!(error instanceof MocksEditRefusal)) throw error;
    log.debug(`Every mock of ${mocksFile} restarts on each edit: ${error.message}`);
    return null;
  }
}

function collectIdentifiers(parsed: ParsedSource): Identifier[] {
  const found: Identifier[] = [];
  new Visitor({ Identifier: (node) => found.push(node) }).visit(parsed.program);
  return found;
}

/* What every mock depends on: statements that bind nothing, side-effect
   imports among them, and the text around the mocks object in its own. */
function sharedPart(
  parsed: ParsedSource,
  object: ObjectExpression,
  top: TopLevel,
  digestOf: (specifier: string) => string,
): string {
  const parts: string[] = [];
  for (const statement of top.others) {
    const holdsMocks = statement.start <= object.start && object.end <= statement.end;
    parts.push(
      holdsMocks
        ? `${parsed.text.slice(statement.start, object.start)}${parsed.text.slice(object.end, statement.end)}`
        : textOf(parsed, statement),
    );
    if (statement.type === "ImportDeclaration") parts.push(digestOf(statement.source.value));
  }
  return sha256Hex(parts.join("\n"));
}

/* Every top-level name the value mentions, and the names those declarations
   mention in turn; an import stands for every module it reaches. */
function usedPart(
  parsed: ParsedSource,
  value: Span,
  identifiers: readonly Identifier[],
  top: TopLevel,
  digestOf: (specifier: string) => string,
): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  const pending = namesWithin(identifiers, value);
  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    const binding = seen.has(name) ? undefined : top.bindings.get(name);
    seen.add(name);
    if (binding?.kind === "import")
      parts.push(`${binding.form} from ${digestOf(binding.specifier)}`);
    if (binding?.kind !== "local") continue;
    parts.push(textOf(parsed, binding.statement));
    pending.push(...namesWithin(identifiers, binding.statement));
  }
  return parts;
}

function namesWithin(identifiers: readonly Identifier[], span: Span): string[] {
  return identifiers
    .filter((identifier) => identifier.start >= span.start && identifier.end <= span.end)
    .map((identifier) => identifier.name);
}
