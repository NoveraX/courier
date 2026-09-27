import type { Comment } from "oxc-parser";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { endpointNames, findGroupDeclaration } from "./group-declaration";

/** One endpoint of a generated file, as its text: the doc comment above it, and its code. */
export interface GeneratedEntry {
  comment: string | null;
  /** From its name to its end, without the comma after it. */
  code: string;
}

function leadingSpace(line: string): number {
  return line.length - line.trimStart().length;
}

/* The text between two offsets, its lines after the first no longer indented by the column it starts at. */
function dedented(content: string, start: number, end: number): string {
  const column = start - (content.lastIndexOf("\n", start - 1) + 1);
  const [first = "", ...rest] = content.slice(start, end).split("\n");
  return [first, ...rest.map((line) => line.slice(Math.min(column, leadingSpace(line))))].join(
    "\n",
  );
}

/* The doc comment right above an entry, with only whitespace between. */
function docCommentBefore(
  content: string,
  comments: readonly Comment[],
  start: number,
): Comment | null {
  const before = comments
    .filter((c) => c.end <= start && c.type === "Block" && c.value.startsWith("*"))
    .at(-1);
  if (before === undefined || content.slice(before.end, start).trim() !== "") return null;
  return before;
}

/** The endpoints a generated file declares, and the name its declaration is bound to. */
export interface GeneratedEndpoints {
  declaration: string | null;
  entries: Map<string, GeneratedEntry>;
}

/**
 * Read the endpoints of a file Studio just generated, as code: each one's
 * text exactly as generated, with its doc comment, whatever lines it spans.
 *
 * @param content - The generated file
 * @returns Each endpoint by name, empty when the file declares none, and the declaration's name
 * @example
 * ```ts
 * generatedEndpoints(groupFile.content).entries.get("createPet")?.code; // → 'createPet: endpoint.post("")'
 * ```
 */
export function generatedEndpoints(content: string): GeneratedEndpoints {
  const parsed = parseSource("generated.ts", content);
  const declaration = findGroupDeclaration(parsed.program);
  const entries = new Map<string, GeneratedEntry>();
  const result = { declaration: declaration?.name ?? null, entries };
  if (declaration === null || endpointNames(declaration.endpoints).size === 0) return result;
  for (const property of declaration.endpoints.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const name = propertyKeyName(property.key);
    if (name === null) continue;
    const doc = docCommentBefore(content, parsed.comments, property.start);
    entries.set(name, {
      comment: doc === null ? null : dedented(content, doc.start, doc.end),
      code: dedented(content, property.start, property.end),
    });
  }
  return result;
}
