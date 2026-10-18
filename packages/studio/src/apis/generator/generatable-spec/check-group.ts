import { RESERVED_ENDPOINT_NAMES } from "../../parser/client-names";
import { isSupportedMethod } from "../../parser/http-methods";
import { isNode, type SpecNode } from "../../parser/spec-node";
import type { ParsedParameter } from "../../parser/types";
import { checkConstraints } from "./check-constraints";
import { checkName } from "./check-name";
import { checkSchema } from "./check-schema";
import type { PendingNodes } from "./pending-nodes";
import type { SpecPath } from "./spec-path";

const PARAMETER_PLACES: ReadonlySet<unknown> = new Set<ParsedParameter["in"]>([
  "path",
  "query",
  "header",
  "cookie",
]);

/**
 * Check a group: its name and its parent's, which the code is written
 * with, and its endpoints' names, which its client is called by; then leave
 * its endpoints to be checked — each one's method, which names the
 * client's call, and the schemas, parameters and encodings it holds.
 *
 * @param group - The group, as the specification gives it
 * @param at - Where it is
 * @param pending - The nodes left to check
 * @throws {InvalidSpecError} For a value refused
 * @example
 * ```ts
 * pending.each(checkGroup, spec.groups, SpecPath.root(), "groups");
 * ```
 */
export function checkGroup(group: SpecNode, at: SpecPath, pending: PendingNodes): void {
  if (group.name !== "") checkName(group.name, at.field("name"), "group");
  if (group.parent != null) checkName(group.parent, at.field("parent"), "group");
  pending.each(checkEndpoint, group.endpoints, at, "endpoints");
  checkEndpointNames(group.endpoints, at.field("endpoints"));
}

/* An endpoint is called by its name: one its client can be called by, and no other endpoint's. */
function checkEndpointNames(endpoints: unknown, at: SpecPath): void {
  if (!Array.isArray(endpoints)) return;
  const named = new Set<string>();
  const items: readonly unknown[] = endpoints;
  items.forEach((endpoint, index) => {
    if (!isNode(endpoint)) return;
    const { name } = endpoint;
    const nameAt: SpecPath = at.index(index).field("name");
    if (typeof name !== "string" || name === "" || name.includes(".")) {
      nameAt.refuse(name, "an endpoint is named by a string with no dot in it");
    }
    if (RESERVED_ENDPOINT_NAMES.has(name)) {
      nameAt.refuse(name, "its client keeps the name for itself");
    }
    if (named.has(name)) nameAt.refuse(name, "another endpoint of the group has the name");
    named.add(name);
  });
}

function checkEndpoint(endpoint: SpecNode, at: SpecPath, pending: PendingNodes): void {
  const method = endpoint.httpMethod;
  if (typeof method !== "string" || !isSupportedMethod(method)) {
    at.field("httpMethod").refuse(method, "it is no method Studio supports");
  }
  pending.later(checkSchema, endpoint.requestBody, at, "requestBody");
  pending.later(checkSchema, endpoint.responseSchema, at, "responseSchema");
  pending.entries(checkEncoding, endpoint.requestBodyEncoding, at, "requestBodyEncoding");
  pending.each(checkParameter, endpoint.parameters, at, "parameters");
}

/* A parameter's name is bound as it is, or quoted; where it is sent decides which. */
function checkParameter(parameter: SpecNode, at: SpecPath, pending: PendingNodes): void {
  if (typeof parameter.name !== "string" || parameter.name === "") {
    at.field("name").refuse(parameter.name, "a parameter is named by a string");
  }
  if (!PARAMETER_PLACES.has(parameter.in)) {
    at.field("in").refuse(parameter.in, "it is no place a parameter is sent in");
  }
  pending.later(checkSchema, parameter.items, at, "items");
  pending.later(checkSchema, parameter.schema, at, "schema");
  pending.later(checkEncoding, parameter.encoding, at, "encoding");
  pending.later(checkConstraints, parameter.constraints, at, "constraints");
}

/* Its style is written quoted; whether it explodes, as it stands. */
function checkEncoding(encoding: SpecNode, at: SpecPath): void {
  const { explode } = encoding;
  if (explode === undefined || typeof explode === "boolean") return;
  at.field("explode").refuse(explode, "explode is a flag");
}
