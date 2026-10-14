/**
 * The API definitions of the enterprise project, as source code: one file
 * per group — with the groups inside it, and a mark on each endpoint its
 * pages may call — and each source's definition with its middleware and
 * streams.
 */
import { pascal } from "./schemas-code.mjs";

/** Each shape of call: its variables and its response, for a record type. */
const SHAPES = {
  list: (t) => ["ListQuery", `page(${t}Item)`],
  byId: (t) => ["ById", `${t}Item`],
  create: (t) => [`${t}Input`, `${t}Item`],
  update: (t) => [`${t}Patch`, `${t}Item`],
  removed: () => ["ById", "Removed"],
  search: (t) => ["Search", `z.array(${t}Item)`],
  export: () => ["Range", "Exported"],
  history: () => ["ById", "z.array(Change)"],
  stats: () => ["Range", "Stats"],
  childList: (t) => [
    "z.object({ parentId: z.string(), page: z.number().int().min(1).optional() })",
    `page(${t}Item)`,
  ],
  childGet: (t) => ["z.object({ parentId: z.string(), id: z.string() })", `${t}Item`],
  childCreate: (t) => [`${t}Input.extend({ parentId: z.string() })`, `${t}Item`],
};
const SHARED = ["ById", "Change", "Exported", "ListQuery", "Range", "Removed", "Search", "Stats"];

/**
 * The type name of a group's records: `Projects`, or `ProjectsNotes` for a
 * group inside `projects`.
 *
 * @param {{ name: string, entity: string, child: boolean }} group - The group
 * @returns {string} The type name
 * @example
 * ```js
 * recordType({ name: "notes", entity: "projects", child: true }); // "ProjectsNotes"
 * ```
 */
export function recordType(group) {
  return group.child ? `${pascal(group.entity)}${pascal(group.name)}` : pascal(group.entity);
}

/**
 * A group's file: its endpoints, each a page may call marked `.expose()`,
 * and the groups inside it, importing only the schemas they use.
 *
 * @param {import("./model.mjs").Group} group - The group
 * @param {string} source - The source it belongs to
 * @param {ReadonlySet<string>} [forPages] - The shapes of call a page may make of it
 * @returns {string} The module's source
 * @example
 * ```js
 * groupFile(group, "core", new Set(["list"])); // export const projects = defineGroup({ … })
 * ```
 */
export function groupFile(group, source, forPages = new Set()) {
  const children = group.groups
    .map(
      (child) =>
        `    ${child.name}: defineGroup({ prefix: "${child.name}", endpoints: ${endpointsOf(child, "      ", forPages)} }),`,
    )
    .join("\n");
  const body = `export const ${group.name} = defineGroup({
  prefix: "${group.name}",
  endpoints: ${endpointsOf(group, "  ", forPages)},${children ? `\n  groups: {\n${children}\n  },` : ""}
});
`;
  const records = [group, ...group.groups].map((each) => {
    const type = recordType(each);
    const names = [`${type}Input`, `${type}Item`, `${type}Patch`].filter((name) =>
      uses(body, name),
    );
    return `import { ${names.join(", ")} } from "../../schemas/${source}/${schemaFile(each)}";`;
  });
  const shared = [...SHARED, "page"].filter((name) => uses(body, name));
  return `import { courier, defineGroup } from "@noverax/courier/define";
${uses(body, "z") ? 'import { z } from "zod";\n' : ""}
${records.join("\n")}
import { ${shared.join(", ")} } from "../../schemas/${source}/shared";
import { tenant } from "./middleware";

const { endpoint } = courier({ middleware: [tenant] });

${body}`;
}

function uses(code, name) {
  return new RegExp(`\\b${name}\\b`).test(code);
}

/**
 * The file a group's schemas are in, by its records' name.
 *
 * @param {{ name: string, entity: string, child: boolean }} group - The group
 * @returns {string} The file's name, without `.ts`
 * @example
 * ```js
 * schemaFile({ name: "notes", entity: "projects", child: true }); // "projects-notes"
 * ```
 */
export function schemaFile(group) {
  return group.child ? `${group.entity}-${group.name}` : group.entity;
}

function endpointsOf(group, indent, forPages) {
  const type = recordType(group);
  const lines = group.endpoints.map((each) => {
    const [variables, response] = SHAPES[each.shape](type);
    const agent = `.agent({ description: "${each.name} ${group.name}", access: "${each.access}" })`;
    const exposed = forPages.has(each.shape) ? ".expose()" : "";
    return `${indent}  ${each.name}: endpoint.${each.verb}("${each.path}").variables(${variables}).response(${response})${agent}${exposed},`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * A source's definition: its groups, its streams and chat, its middleware.
 *
 * @param {import("./model.mjs").Source} source - The source
 * @param {number} port - Where its backend listens
 * @param {number | undefined} app - The app's port, when pages call this source through its proxy
 * @returns {string} The module's source
 * @example
 * ```js
 * sourceFile(source, 4100, 7400);
 * ```
 */
export function sourceFile(source, port, app) {
  const groups = source.groups.map((group) => group.name);
  const streams = source.streams
    .map((name) => `    ${name}: stream.response(${pascal(name)}Event).get("events/${name}"),`)
    .join("\n");
  const events = source.streams
    .map(
      (name) =>
        `const ${pascal(name)}Event = z.object({ id: z.string(), kind: z.string(), at: z.iso.datetime() });`,
    )
    .join("\n");
  const chat = source.channels.length
    ? `    chat: channel.send(z.object({ text: z.string().min(1) })).response(z.object({ from: z.string(), text: z.string() })).implement(() => ({ onMessage(ctx, message) { ctx.send({ from: "desk", text: message.text }); } })),`
    : "";
  const realtime = Boolean(streams || chat);
  const live = realtime
    ? `const { stream, channel } = courier();
${events}

const live = defineGroup({
  prefix: "live",
  endpoints: {
${[streams, chat].filter(Boolean).join("\n")}
  },
});
`
    : "";
  return `import { ${realtime ? "courier, defineApi, defineGroup" : "defineApi"} } from "@noverax/courier/define";
${realtime ? 'import { z } from "zod";\n' : ""}
${groups.map((name) => `import { ${name} } from "./${name}";`).join("\n")}
import { requestId } from "./middleware";

${live}
/** The ${source.name} API: ${source.endpoints} endpoints. */
export const ${source.name} = defineApi({
  baseURL: process.env.${source.name.toUpperCase()}_URL ?? "http://127.0.0.1:${port}",
  middleware: [requestId],${app ? `\n  proxyPath: { http: "http://127.0.0.1:${app}/api/request", sse: "http://127.0.0.1:${app}/api/sse", ws: "ws://127.0.0.1:${app}/ws" },` : ""}
  groups: { ${[...groups, ...(realtime ? ["live"] : [])].join(", ")} },
});
`;
}
