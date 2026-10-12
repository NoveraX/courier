/**
 * The applications of the enterprise project, as source code: server code
 * calling the APIs by `createCaller`, pages calling them through the proxy,
 * and the internal libraries both build on, each depending on others.
 */
import { pick, some } from "./random.mjs";
import { inputValue, pascal } from "./schemas-code.mjs";
import { LIBRARIES } from "./words.mjs";

/** The variables a call of each shape sends, for a record's fields. */
const ARGUMENTS = {
  list: () => "{ page: 1, size: 20 }",
  byId: () => '{ id: "id_1" }',
  create: (fields) => inputValue(fields),
  update: () => '{ id: "id_1", name: "Renamed" }',
  removed: () => '{ id: "id_1" }',
  search: () => '{ q: "quarterly" }',
  export: () => "{}",
  history: () => '{ id: "id_1" }',
  stats: () => '{ from: "2026-01-01T00:00:00Z" }',
  childList: () => '{ parentId: "p_1" }',
  childGet: () => '{ parentId: "p_1", id: "id_1" }',
  childCreate: (fields) =>
    inputValue(fields.filter((field) => field !== "parentId")).replace("{ ", '{ parentId: "p_1", '),
};

/**
 * A call of an endpoint, as code: `backend.core.projects.list({ page: 1, size: 20 })`.
 *
 * @param {string} caller - What calls: `backend` or `storefront`
 * @param {{ source: string, path: string, group: import("./model.mjs").Group, endpoint: import("./model.mjs").Endpoint }} at - The endpoint
 * @returns {string} The call
 * @example
 * ```js
 * callOf("backend", at);
 * ```
 */
export function callOf(caller, at) {
  const variables = ARGUMENTS[at.endpoint.shape](at.group.fields);
  return `${caller}.${at.source}.${at.path}.${at.endpoint.name}(${variables})`;
}

/**
 * A file of server code: a function that calls some endpoints and uses two
 * internal libraries.
 *
 * @param {() => number} next - The random number source
 * @param {string} name - The function's name
 * @param {readonly Parameters<typeof callOf>[1][]} calls - The endpoints it calls
 * @returns {string} The module's source
 * @example
 * ```js
 * serverFile(next, "loadProjects", calls);
 * ```
 */
export function serverFile(next, name, calls) {
  const [first, second] = some(next, LIBRARIES, 2);
  const lines = calls.map((at) => `    await ${callOf("backend", at)},`).join("\n");
  return `import { ${libFunction(first ?? "format")} } from "@enterprise/${first}";
import { ${libFunction(second ?? "ids")} } from "@enterprise/${second}";

import { backend } from "../../courier/callers";

/** What the ${name} step of this area reads and writes, in order. */
export async function ${name}(): Promise<number> {
  const results = [
${lines}
  ];
  return ${libFunction(first ?? "format")}(results.length) + ${libFunction(second ?? "ids")}(results.length);
}
`;
}

/**
 * A page: what it shows, read through the proxy at the endpoints the
 * boundary exposes.
 *
 * @param {string} name - The page's name
 * @param {readonly Parameters<typeof callOf>[1][]} calls - The endpoints it calls
 * @returns {string} The module's source
 * @example
 * ```js
 * pageFile("ProjectsPage", calls);
 * ```
 */
export function pageFile(name, calls) {
  const lines = calls.map(
    (at) =>
      `  const ${at.endpoint.name}${pascal(at.group.name)} = await ${callOf("storefront", at)};`,
  );
  const names = calls.map((at) => `${at.endpoint.name}${pascal(at.group.name)}`);
  return `import { storefront } from "../../courier/storefront";

/** The data the ${name} shows, fetched through the app's own server. */
export async function ${name}(): Promise<unknown[]> {
${lines.join("\n")}
  return [${names.join(", ")}];
}
`;
}

/**
 * A module of an internal library: a function, and its use of another
 * library's.
 *
 * @param {() => number} next - The random number source
 * @param {string} library - The library's name
 * @param {number} index - Which of its modules
 * @returns {string} The module's source
 * @example
 * ```js
 * libraryModule(next, "money", 3);
 * ```
 */
export function libraryModule(next, library, index) {
  const other = pick(
    next,
    LIBRARIES.filter((each) => each !== library),
  );
  const own = index === 0 ? libFunction(library) : `${libFunction(library)}${index}`;
  return `import { ${libFunction(other)} } from "@enterprise/${other}";

/** A value of the ${library} library's kind, worked out from a number. */
export interface ${pascal(library)}Value${index} {
  readonly input: number;
  readonly output: number;
  readonly label: string;
}

/** The ${library} step ${index}: weighs a number with the ${other} library's. */
export function ${own}(input: number): number {
  const value: ${pascal(library)}Value${index} = { input, output: input * ${index + 2}, label: "${library}-${index}" };
  return value.output + (input > 1_000_000 ? ${libFunction(other)}(input / 2) : 0);
}
`;
}

/**
 * A library's own function's name: `feature-flags` → `featureFlags`.
 *
 * @param {string} library - The library's name
 * @returns {string} The function's name
 * @example
 * ```js
 * libFunction("feature-flags"); // "featureFlags"
 * ```
 */
export function libFunction(library) {
  const name = pascal(library);
  return name.charAt(0).toLowerCase() + name.slice(1);
}
