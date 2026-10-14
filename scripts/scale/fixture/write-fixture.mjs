/**
 * Write the enterprise project to disk: every file the model and the code
 * makers give, and a `node_modules` folder of links to the repository's
 * packages, so its imports resolve to the workspace's packages as an
 * installed project's would — a folder of its own, as an install makes, so
 * that Studio keeps its transform cache there as it does in any project.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { groupFile, recordType, schemaFile, sourceFile } from "./api-code.mjs";
import { libFunction, libraryModule, pageFile, serverFile } from "./app-code.mjs";
import { enterpriseModel, httpEndpoints } from "./model.mjs";
import {
  callerFiles,
  courierFiles,
  middlewareFile,
  portsOf,
  projectFiles,
  routesFile,
} from "./project-code.mjs";
import { seeded, some } from "./random.mjs";
import { groupSchemas, pascal, sharedSchemas } from "./schemas-code.mjs";
import { AREAS, LIBRARIES } from "./words.mjs";

/** What marks a folder as one this script wrote, and may write again. */
const MARK = ".courier-scale-fixture";
/** The sources whose endpoints pages call through the proxy. */
const EXPOSED = ["core", "catalog"];
/** The shapes of call a page makes of those sources, each endpoint of them marked `.expose()`. */
const FOR_PAGES = new Set(["list", "byId", "search", "create", "update"]);
const MODULES_PER_LIBRARY = 8;

/**
 * Write the enterprise project for a number of endpoints into a folder.
 *
 * @param {{ dir: string, repo: string, endpoints?: number, seed?: number, portBase?: number, records?: number }} options - Where, from which repository, and how large
 * @returns {{ files: number, endpoints: number, calls: number, ports: ReturnType<typeof portsOf> }} What was written
 * @example
 * ```js
 * writeFixture({ dir: "/tmp/courier-scale/e1000", repo: process.cwd(), endpoints: 1000 });
 * ```
 */
export function writeFixture({
  dir,
  repo,
  endpoints = 1000,
  seed = 1,
  portBase = 7400,
  records = 200,
}) {
  if (existsSync(dir) && !existsSync(join(dir, MARK))) {
    throw new Error(`${dir} exists and was not written by this script: pick another folder`);
  }
  rmSync(dir, { recursive: true, force: true });
  const model = enterpriseModel({ endpoints, seed });
  const next = seeded(seed + 7);
  const ports = portsOf(portBase);
  const files = new Map([
    [MARK, "The enterprise project the scale tests measure; written by scripts/scale.\n"],
  ]);
  const add = (path, text) => files.set(path, text);
  model.sources.forEach((source, index) => {
    add(`src/schemas/${source.name}/shared.ts`, sharedSchemas());
    add(`src/api/${source.name}/middleware.ts`, middlewareFile());
    add(
      `src/api/${source.name}/index.ts`,
      sourceFile(
        source,
        ports.mocks + index,
        EXPOSED.includes(source.name) ? ports.app : undefined,
      ),
    );
    for (const group of source.groups) {
      const forPages = EXPOSED.includes(source.name) ? FOR_PAGES : new Set();
      add(`src/api/${source.name}/${group.name}.ts`, groupFile(group, source.name, forPages));
      for (const each of [group, ...group.groups]) {
        add(
          `src/schemas/${source.name}/${schemaFile(each)}.ts`,
          groupSchemas(recordType(each), each.fields),
        );
      }
    }
  });
  const http = httpEndpoints(model);
  const exposed = http.filter(
    (at) => EXPOSED.includes(at.source) && FOR_PAGES.has(at.endpoint.shape),
  );
  add(
    "courier.routes.ts",
    routesFile(
      Object.fromEntries(
        EXPOSED.map((source) => [source, exposed.filter((at) => at.source === source)]),
      ),
    ),
  );
  let calls = 0;
  for (let index = 0; index < Math.round(endpoints * 0.6); index++) {
    const area = AREAS[index % AREAS.length] ?? "admin";
    const chosen = some(next, http, 5);
    const name = `${area.replace(/-/g, "")}${pascal(chosen[0]?.group.name ?? "step")}Step${index}`;
    add(`src/app/${area}/${chosen[0]?.group.name}-${index}.ts`, serverFile(next, name, chosen));
    calls += chosen.length;
  }
  for (let index = 0; index < Math.round(endpoints * 0.1); index++) {
    const chosen = some(next, exposed, 3);
    add(
      `src/pages/${AREAS[index % AREAS.length]}/page-${index}.ts`,
      pageFile(`page${index}`, chosen),
    );
    calls += chosen.length;
  }
  for (const library of LIBRARIES) {
    const names = Array.from({ length: MODULES_PER_LIBRARY }, (_, at) =>
      at === 0 ? libFunction(library) : `${libFunction(library)}${at}`,
    );
    for (let at = 0; at < names.length; at++) {
      add(`libs/${library}/src/${library}-${at}.ts`, libraryModule(next, library, at));
    }
    add(
      `libs/${library}/src/index.ts`,
      `${names.map((name, at) => `export { ${name} } from "./${library}-${at}";`).join("\n")}\n`,
    );
    add(
      `libs/${library}/package.json`,
      `${JSON.stringify({ name: `@enterprise/${library}`, private: true, type: "module" }, null, 2)}\n`,
    );
  }
  const sources = model.sources.map((source) => source.name);
  for (const [path, text] of Object.entries({
    ...projectFiles(),
    ...callerFiles(sources, EXPOSED, ports.app),
    ...courierFiles(sources, ports, records),
  }))
    add(path, text);
  for (const [path, text] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  linkPackages(join(repo, "node_modules"), join(dir, "node_modules"));
  return { files: files.size, endpoints: model.endpoints, calls, ports };
}

/* Every package of the repository's node_modules, linked into the project's own; its caches stay its own. */
function linkPackages(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith(".")) continue;
    symlinkSync(join(from, name), join(to, name), "dir");
  }
}
