import type { FieldError, MockDeclaration } from "./types";
import { type RuledField, valueProblem } from "./value-problem";

/** What the project already has, for checking new declarations against it. */
export interface DeclarationState {
  /** The keys under `sources` in the loaded `courier.config.*`. */
  sourceKeys: readonly string[];
  /**
   * The keys of the mocks Studio loaded. A key written in the mocks file
   * that did not load is found when the edit is planned, not here.
   */
  declaredKeys: readonly string[];
  /** The declared keys set to `undefined`, which switches their mock off. */
  switchedOffKeys: readonly string[];
  /** Each port a mock holds exactly, and the key of that mock. */
  declaredPorts: ReadonlyMap<number, string>;
  /** The port Studio itself listens on, or `null` when it is not known. */
  studioPort: number | null;
  /** The mocks file's name relative to the project root, for messages. */
  mocksFileName: string;
}

/** The project's state, indexed for lookups. */
interface Project {
  state: DeclarationState;
  sources: ReadonlySet<string>;
  /** Declared keys by their lower-case form. */
  declared: ReadonlyMap<string, string>;
  /** The switched-off keys, in lower case. */
  switchedOff: ReadonlySet<string>;
}

/** The declarations earlier in the request: keys by lower-case form, and keys by fixed port. */
interface Earlier {
  keys: Map<string, string>;
  ports: Map<number, string>;
}

const FIELD_ORDER: readonly RuledField[] = [
  "source",
  "key",
  "port",
  "seedCount",
  "endpoints",
  "fixtures",
];

function sourceProblem({ source }: MockDeclaration, project: Project | null): string | null {
  if (project === null || project.sources.has(source)) return null;
  return `courier.config has no sources.${source}; a source your app only registers at runtime has to be added under sources first`;
}

/* Keys are compared ignoring case: Studio names each mock by its key, and
   two keys that differ only in case would read as the same mock. */
function keyProblem(
  { key }: MockDeclaration,
  earlier: Earlier,
  project: Project | null,
): string | null {
  const repeated = earlier.keys.get(key.toLowerCase());
  if (repeated !== undefined) {
    return `the request already asks for "${repeated}"; keys must differ in more than letter case`;
  }
  const existing = project?.declared.get(key.toLowerCase());
  if (project === null || existing === undefined) return null;
  const file = project.state.mocksFileName;
  if (project.switchedOff.has(key.toLowerCase())) {
    return `${file} already declares ${existing}, switched off with undefined; turn it on there, or pick another key`;
  }
  return `${file} already declares ${existing}`;
}

function portProblem(
  request: MockDeclaration,
  earlier: Earlier,
  project: Project | null,
): string | null {
  const { port, key } = request;
  if (port === null) return null;
  const repeated = earlier.ports.get(port);
  if (repeated !== undefined) return `${repeated} in this request already asks for port ${port}`;
  if (project === null) return null;
  if (port === project.state.studioPort) return `port ${port} is Studio's own`;
  const holder = project.state.declaredPorts.get(port);
  /* A port held under the request's own key is the key's problem, reported once as that. */
  if (holder === undefined || holder.toLowerCase() === key.toLowerCase()) return null;
  return `port ${port} is ${holder}'s`;
}

function relationProblem(
  request: MockDeclaration,
  field: RuledField,
  earlier: Earlier,
  project: Project | null,
): string | null {
  switch (field) {
    case "source":
      return sourceProblem(request, project);
    case "key":
      return keyProblem(request, earlier, project);
    case "port":
      return portProblem(request, earlier, project);
    case "seedCount":
    case "endpoints":
    case "fixtures":
      return null;
  }
}

function remember({ key, port }: MockDeclaration, earlier: Earlier): void {
  if (!earlier.keys.has(key.toLowerCase())) earlier.keys.set(key.toLowerCase(), key);
  if (port !== null && !earlier.ports.has(port)) earlier.ports.set(port, key);
}

function indexed(state: DeclarationState): Project {
  const declared = new Map(state.declaredKeys.map((key) => [key.toLowerCase(), key]));
  const switchedOff = new Set(state.switchedOffKeys.map((key) => key.toLowerCase()));
  return { state, sources: new Set(state.sourceKeys), declared, switchedOff };
}

/**
 * Checks the values of declarations that are each well formed in shape: each
 * value on its own — a key that is an identifier and no inherited name, a
 * source a file can hold, a port and a seed count in range — then against the
 * rest of the request — keys and fixed ports each asked for once — and, given
 * the project's state, against what the project already has: a source the
 * config declares, a key no mock has taken, a port neither Studio nor another
 * mock holds. Keys are compared ignoring letter case throughout.
 *
 * Each field gets at most one error, the first rule it breaks in that order,
 * attributed to the declaration by its position in the request.
 *
 * @param requests - The declarations, as the request body gave them.
 * @param state - The project's sources, declared mocks and ports; `null` to check the request alone.
 * @returns Every problem found, in request order; empty when all can be declared.
 * @example
 * validateDeclarations(
 *   [{ key: "Users", source: "users", port: 6280, seedCount: 20, autoStart: true }],
 *   {
 *     sourceKeys: ["users"],
 *     declaredKeys: ["users"],
 *     switchedOffKeys: [],
 *     declaredPorts: new Map(),
 *     studioPort: 6280,
 *     mocksFileName: "courier.mocks.ts",
 *   },
 * );
 * // [
 * //   { index: 0, source: "users", field: "key", message: "courier.mocks.ts already declares users" },
 * //   { index: 0, source: "users", field: "port", message: "port 6280 is Studio's own" },
 * // ]
 */
export function validateDeclarations(
  requests: readonly MockDeclaration[],
  state: DeclarationState | null,
): FieldError[] {
  const project = state === null ? null : indexed(state);
  const earlier: Earlier = { keys: new Map(), ports: new Map() };
  const errors: FieldError[] = [];
  for (const [index, request] of requests.entries()) {
    for (const field of FIELD_ORDER) {
      const message =
        valueProblem(request, field) ?? relationProblem(request, field, earlier, project);
      if (message !== null) errors.push({ index, source: request.source, field, message });
    }
    remember(request, earlier);
  }
  return errors;
}
