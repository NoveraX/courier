import { isNode } from "../../parser/spec-node";
import type { ParsedSpec } from "../../parser/types";
import { checkGroup } from "./check-group";
import { checkGroupNames } from "./check-group-names";
import { checkName } from "./check-name";
import { checkSchema } from "./check-schema";
import { PendingNodes } from "./pending-nodes";
import { SpecPath } from "./spec-path";

/**
 * Refuse a specification any value of which the generator would write
 * into the code as it stands, unless the value is of a kind that can only
 * be what it says: a schema's name, a name a schema refers to by, a
 * group's and its parent's, each an identifier in ASCII and no word
 * JavaScript, TypeScript or the generated files keep for themselves; a
 * schema's type, one a schema has; an endpoint's method, one Studio
 * supports; a count or a bound, a finite number; an encoding's `explode`, a
 * flag; a pattern, one whose literal ends where its source does. Every
 * other value is written quoted, as a comment's text, or only tested. The
 * names the generated code is called by are held to what it can be called
 * by: an endpoint's, a string with no dot that its client does not keep
 * for itself, and no other endpoint's of its group; a parameter's, a
 * string; a group's, no other group's, and a parent's, a group's, in a
 * chain that does not loop. A node on the way to a value is an object and a
 * list a list; one left out, or `null`, holds nothing to refuse.
 *
 * Every specification Studio's parser gives passes. One sent back to
 * Studio, or one an import's transform returns, is held to it before a
 * line is generated, since nothing else would stop a value in it from
 * becoming code. It is walked without recursion, so a specification nested
 * deeper than the stack is checked all the same.
 *
 * @param spec - The specification to generate from
 * @throws {InvalidSpecError} For a value refused, naming where it is
 * @example
 * ```ts
 * assertGeneratable(parseSpec(text)); // passes
 * assertGeneratable({ ...spec, schemas: { "Pet; run()": pet } }); // throws
 * ```
 */
export function assertGeneratable(spec: ParsedSpec): void {
  const root = SpecPath.root();
  const schemas: unknown = spec.schemas;
  if (isNode(schemas)) {
    const named = root.field("schemas");
    for (const name of Object.keys(schemas)) checkName(name, named, "schema");
  }
  const pending = new PendingNodes();
  pending.entries(checkSchema, schemas, root, "schemas");
  pending.each(checkGroup, spec.groups, root, "groups");
  pending.checkAll();
  checkGroupNames(spec.groups, root.field("groups"));
}
