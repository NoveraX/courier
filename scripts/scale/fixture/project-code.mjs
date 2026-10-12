/**
 * The project files of the enterprise fixture, as source code: its
 * manifest and TypeScript settings, Courier's config and mocks, the callers
 * its code uses, the boundaries its pages call through, and its server.
 */

/** Where the fixture's processes listen, from a base port: the server, Studio, and each mock. */
export function portsOf(base) {
  return { app: base, studio: base + 1, mocks: base + 10 };
}

/**
 * The fixture's manifest and TypeScript settings.
 *
 * @returns {Record<string, string>} The files, by their path
 * @example
 * ```js
 * projectFiles(); // { "package.json": "…", "tsconfig.json": "…" }
 * ```
 */
export function projectFiles() {
  const manifest = {
    name: "enterprise-app",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: Object.fromEntries(
      [
        "@noverax/courier",
        "@noverax/courier-mock",
        "@noverax/courier-server",
        "@noverax/courier-studio",
      ]
        .concat(["@noverax/courier-studio-core", "zod"])
        .map((name) => [name, "*"]),
    ),
  };
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["node"],
      paths: { "@enterprise/*": ["./libs/*/src/index.ts"] },
    },
    include: ["src", "libs", "courier.config.ts", "courier.mocks.ts"],
  };
  return {
    "package.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
  };
}

/** A source's middleware: an id for every request, and the tenant it is for. */
export function middlewareFile() {
  return `import { randomUUID } from "node:crypto";
import { defineMiddleware } from "@noverax/courier/middleware";

export const requestId = defineMiddleware("requestId", "before", (ctx) => {
  ctx.headers.set("x-request-id", randomUUID());
});

export const tenant = defineMiddleware("tenant", "before", (ctx) => {
  ctx.headers.set("x-tenant", "acme");
});
`;
}

/**
 * The callers the server code and the pages use.
 *
 * @param {readonly string[]} sources - The sources' names
 * @param {readonly string[]} exposed - The sources pages may call through the proxy
 * @returns {Record<string, string>} The files, by their path
 * @example
 * ```js
 * callerFiles(["core", "billing"], ["core"]);
 * ```
 */
export function callerFiles(sources, exposed) {
  const imports = sources.map((name) => `import { ${name} } from "../api/${name}";`).join("\n");
  const backend = `import { createCaller } from "@noverax/courier";

${imports}

/** What the server code calls: every API itself. */
export const backend = {
${sources.map((name) => `  ${name}: createCaller(${name}),`).join("\n")}
};
`;
  const types = exposed.map((name) => `import type { ${name} } from "../api/${name}";`).join("\n");
  const boundaries = exposed
    .map((name) => `import { ${name}Boundary } from "../api/${name}/boundary";`)
    .join("\n");
  const storefront = `import { createProxyCaller } from "@noverax/courier";

${types}
${boundaries}

/** What the pages call: the APIs through the app's own server, at what the boundaries expose. */
export const storefront = {
${exposed.map((name) => `  ${name}: createProxyCaller<typeof ${name}>("${name}", { boundary: ${name}Boundary }),`).join("\n")}
};
`;
  return { "src/courier/callers.ts": backend, "src/courier/storefront.ts": storefront };
}

/**
 * A source's boundary: the endpoints its pages may call through the proxy.
 *
 * @param {string} source - The source's name
 * @param {readonly { path: string, endpoint: { name: string, verb: string } }[]} exposed - The endpoints
 * @param {number} app - The app's port
 * @returns {string} The module's source
 * @example
 * ```js
 * boundaryFile("core", exposed, 7400);
 * ```
 */
export function boundaryFile(source, exposed, app) {
  const lines = exposed.map(
    (at) =>
      `    "${at.path}.${at.endpoint.name}": "${at.endpoint.verb === "get" ? "query" : "mutation"}",`,
  );
  return `import { defineBoundary } from "@noverax/courier/define";

/** The ${source} endpoints a page may call through the app's server. */
export const ${source}Boundary = defineBoundary({
  source: "${source}",
  proxyPath: {
    http: "http://127.0.0.1:${app}/api/request",
    sse: "http://127.0.0.1:${app}/api/sse",
    ws: "ws://127.0.0.1:${app}/ws",
  },
  expose: {
${lines.join("\n")}
  },
});
`;
}

/**
 * Courier's config, the mocks Studio runs, and the app's server.
 *
 * @param {readonly string[]} sources - The sources' names
 * @param {ReturnType<typeof portsOf>} ports - Where things listen
 * @param {number} seed - How many records each mock's collections start with
 * @returns {Record<string, string>} The files, by their path
 * @example
 * ```js
 * courierFiles(["core"], portsOf(7400), 200);
 * ```
 */
export function courierFiles(sources, ports, seed) {
  const imports = sources.map((name) => `import { ${name} } from "./src/api/${name}";`).join("\n");
  const config = `import { defineConfig } from "@noverax/courier/config";

${imports}

/** Read by the app's server, by Studio, and by every process that attaches to Studio. */
export default defineConfig({
  sources: { ${sources.join(", ")} },
  server: { port: ${ports.app} },
  studio: { port: ${ports.studio}, mockBasePort: ${ports.mocks} },
});
`;
  const mockLines = sources.map(
    (name, index) => `  ${name}: defineMockServer({
    source: ${name},
    port: ${ports.mocks + index},
    autoStart: true,
    log: "silent",
    seed: { count: ${seed} },
  }),`,
  );
  const mocks = `import { defineMockServer, defineMocks } from "@noverax/courier-mock";

${imports}

/** A mock of every API, its collections seeded, started with Studio. */
export default defineMocks({
${mockLines.join("\n")}
});
`;
  const server = `import { createCourierServer } from "@noverax/courier-server";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";

${sources.map((name) => `import { ${name} } from "../api/${name}";`).join("\n")}

/* The app's own server: Courier's proxy in front of every API, attached to Studio when it runs. */
if (process.env.ATTACH_STUDIO === "1") await attachRuntime("enterprise-server");
createCourierServer({ sources: { ${sources.join(", ")} }, port: ${ports.app}, host: "127.0.0.1" });
`;
  return { "courier.config.ts": config, "courier.mocks.ts": mocks, "src/server/main.ts": server };
}
