import type { CourierRoutes, RouteShape } from "@noverax/courier/define";

/** The words every routes module opens with, by which Studio knows a file it wrote. */
export const ROUTES_MODULE_MARK = "Written by Courier Studio from";

/** One source's routes, under the name the module exports them by. */
export interface NamedRoutes {
  exportName: string;
  routes: CourierRoutes;
}

/** What a routes module is written from. */
export interface RoutesModuleInput {
  /** The config's file name, which the module says it was written from: `courier.config.ts`. */
  configName: string;
  /** Each source with an endpoint a page may call, in the order they are written. */
  sources: readonly NamedRoutes[];
  /**
   * How the module imports the config's type, `./courier.config`; absent for
   * a JavaScript module, which carries no types.
   */
  configSpecifier?: string | undefined;
}

/**
 * The text of a routes module: what a page's proxy client may call of each
 * source, and how it reaches each endpoint. A TypeScript module holds its
 * routes to the API they were written from — a path the API no longer
 * defines, or one it declares otherwise, does not compile — and types the
 * client from it; the API itself is imported as a type alone, so a page's
 * bundle holds the routes and nothing else of the project.
 *
 * @param input - The sources, and the config they were read from
 * @returns The module's text
 * @example
 * ```ts
 * routesModuleText({ configName: "courier.config.ts", configSpecifier: "./courier.config", sources });
 * ```
 */
export function routesModuleText({
  configName,
  sources,
  configSpecifier,
}: RoutesModuleInput): string {
  const header = [
    `// ${ROUTES_MODULE_MARK} ${configName}. Do not edit it:`,
    "// `courier-studio routes` writes it again from the endpoints marked .expose().",
    "",
  ];
  if (sources.length === 0) {
    return [
      ...header,
      "// No endpoint is marked .expose(), so a page may call none.",
      "export {};",
      "",
    ].join("\n");
  }
  if (configSpecifier === undefined) {
    return [...header.slice(0, -1), ...sources.flatMap(untypedSource), ""].join("\n");
  }
  return [
    ...header,
    'import type { CourierRoutes, RouteMap } from "@noverax/courier/define";',
    "",
    `import type config from ${JSON.stringify(configSpecifier)};`,
    "",
    'type Sources = (typeof config)["sources"];',
    ...sources.flatMap(typedSource),
    "",
  ].join("\n");
}

function typedSource({ exportName, routes }: NamedRoutes): string[] {
  const api = `Sources[${JSON.stringify(routes.source)}]`;
  const endpoints = `${exportName.slice(0, -"Routes".length)}Endpoints`;
  return [
    "",
    `const ${endpoints} = {`,
    ...endpointLines(routes.endpoints, "  "),
    `} as const satisfies RouteMap<${api}>;`,
    "",
    doc(routes.source),
    `export const ${exportName}: CourierRoutes<${api}, typeof ${endpoints}> = {`,
    `  source: ${JSON.stringify(routes.source)},`,
    `  endpoints: ${endpoints},`,
    ...followedLines(routes),
    "};",
  ];
}

function untypedSource({ exportName, routes }: NamedRoutes): string[] {
  return [
    "",
    doc(routes.source),
    `export const ${exportName} = {`,
    `  source: ${JSON.stringify(routes.source)},`,
    "  endpoints: {",
    ...endpointLines(routes.endpoints, "    "),
    "  },",
    ...followedLines(routes),
    "};",
  ];
}

function doc(source: string): string {
  return `/** What a page's proxy client may call of \`${source}\`, and how it reaches each endpoint. */`;
}

function endpointLines(endpoints: Readonly<Record<string, RouteShape>>, indent: string): string[] {
  return Object.entries(endpoints).map(
    ([path, shape]) => `${indent}${JSON.stringify(path)}: ${shapeText(shape)},`,
  );
}

/* Written in the order the shape's own fields are declared, so a module reads the same each time. */
function shapeText(shape: RouteShape): string {
  if ("transport" in shape) {
    const both = shape.transport === "ws" && shape.bidirectional === true;
    return `{ transport: ${JSON.stringify(shape.transport)}${both ? ", bidirectional: true" : ""} }`;
  }
  const get = shape.type === "query" && shape.get === true;
  return `{ type: ${JSON.stringify(shape.type)}${get ? ", get: true" : ""} }`;
}

/* The API's own say on cancelling and sharing reads, which its browser client follows too. */
function followedLines({ cancelPrevious, coalesce }: CourierRoutes): string[] {
  return [
    ...(cancelPrevious === undefined
      ? []
      : [`  cancelPrevious: [${cancelPrevious.map((name) => JSON.stringify(name)).join(", ")}],`]),
    ...(coalesce === undefined ? [] : [`  coalesce: ${String(coalesce)},`]),
  ];
}
