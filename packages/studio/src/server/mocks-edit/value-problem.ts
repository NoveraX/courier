import type { MockDeclaration } from "./types";

/** The fields of a declaration whose value has rules of its own. */
export type RuledField = "key" | "source" | "port" | "seedCount" | "endpoints" | "fixtures";

/** The key is written unquoted, as a property name, into the mocks file. */
const KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const MAX_SOURCE_LENGTH = 200;
const MAX_PORT = 65535;
const MAX_SEED_COUNT = 1000;
/* An endpoint by name: `group.method`, or the method alone outside any group. */
const ENDPOINT_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}(\.[A-Za-z_$][A-Za-z0-9_$]{0,63})?$/;
const MAX_FIXTURES_LENGTH = 200;

/**
 * Whether a name is one every object inherits, so a lookup by it finds
 * something even where nothing was declared under it.
 */
function isInheritedName(name: string): boolean {
  return name in Object.prototype;
}

function isIntegerUpTo(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

function keyProblem(key: string): string | null {
  if (!KEY_PATTERN.test(key)) {
    return "a key must be an identifier of 1 to 64 letters, digits, _ or $ that does not start with a digit";
  }
  if (isInheritedName(key)) {
    return `"${key}" is a name every object inherits, so it cannot be a key`;
  }
  return null;
}

/* The source is written into the mocks file as a string literal, so it
   must be text a file can hold exactly: an unpaired surrogate is written as
   U+FFFD and would name another source than the one asked for. */
function sourceProblem(source: string): string | null {
  if (source.length === 0 || source.length > MAX_SOURCE_LENGTH) {
    return `a source must be 1 to ${MAX_SOURCE_LENGTH} characters long`;
  }
  if (CONTROL_CHARACTER.test(source)) return "a source must not contain control characters";
  if (!source.isWellFormed()) {
    return "a source must be well-formed Unicode text, without unpaired surrogates";
  }
  if (isInheritedName(source)) {
    return `"${source}" is a name every object inherits, so it cannot be a source`;
  }
  return null;
}

function portProblem(port: number | null): string | null {
  if (port === null || isIntegerUpTo(port, MAX_PORT)) return null;
  return `a port must be an integer from 1 to ${MAX_PORT}`;
}

function seedCountProblem(seedCount: number): string | null {
  if (isIntegerUpTo(seedCount, MAX_SEED_COUNT)) return null;
  return `a seed count must be an integer from 1 to ${MAX_SEED_COUNT}`;
}

/**
 * What is wrong with one field's value on its own, whatever the project
 * holds: a key that cannot be written as a property name, a source a file
 * cannot hold, a port or seed count out of range.
 *
 * @param declaration - A declaration of the right shape
 * @param field - The field to check
 * @returns Why the value cannot be declared, or `null` when it can
 * @example
 * ```ts
 * valueProblem({ key: "users", source: "users", port: 70000, seedCount: 20, autoStart: true }, "port");
 * // "a port must be an integer from 1 to 65535"
 * ```
 */
function endpointsProblem(endpoints: readonly string[] | undefined): string | null {
  if (endpoints === undefined) return null;
  if (endpoints.length === 0) return "a mock that answers some endpoints names at least one";
  const bad = endpoints.find((name) => !ENDPOINT_NAME.test(name) || isInheritedName(name));
  if (bad !== undefined) return `"${bad}" is not an endpoint name, such as orders.refund`;
  const twice = endpoints.find((name, i) => endpoints.indexOf(name) !== i);
  return twice === undefined ? null : `"${twice}" is named twice`;
}

/* The mock writes its recordings there, so it stays inside the project:
   a relative POSIX path, without "..", to a .har file. */
function fixturesProblem(fixtures: string | undefined): string | null {
  if (fixtures === undefined) return null;
  const relative =
    !fixtures.startsWith("/") && !fixtures.includes("\\") && !/^[A-Za-z]:/.test(fixtures);
  const inside = !fixtures.split("/").includes("..");
  if (
    fixtures.length > MAX_FIXTURES_LENGTH ||
    CONTROL_CHARACTER.test(fixtures) ||
    !fixtures.isWellFormed()
  ) {
    return `a recordings file must be a path of up to ${MAX_FIXTURES_LENGTH} characters`;
  }
  if (!relative || !inside || !fixtures.endsWith(".har")) {
    return "a recordings file must be a .har path relative to the mocks file, inside the project";
  }
  return null;
}

export function valueProblem(declaration: MockDeclaration, field: RuledField): string | null {
  switch (field) {
    case "key":
      return keyProblem(declaration.key);
    case "source":
      return sourceProblem(declaration.source);
    case "port":
      return portProblem(declaration.port);
    case "seedCount":
      return seedCountProblem(declaration.seedCount);
    case "endpoints":
      return endpointsProblem(declaration.endpoints);
    case "fixtures":
      return fixturesProblem(declaration.fixtures);
  }
}
