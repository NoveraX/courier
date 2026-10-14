/**
 * What a page takes from Courier, as the documentation shows it: the
 * shared definitions, a direct caller, a proxy caller, one with its
 * boundary, and React Query hooks.
 *
 * A budget is what the scenario measured when it was set, and a little
 * room: a change that grows a page past it either earns its bytes, and the
 * budget is raised here with the reason in the commit, or is made smaller.
 */

const DEFINE = `import { courier, defineApi, defineGroup, defineBoundary } from "@noverax/courier/define";
const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: {
  getAll: endpoint.get("").response(), getById: endpoint.get(":id").variables().response(),
  create: endpoint.post("").variables().response() } });
export const api = defineApi({ baseURL: "https://api.example.com", groups: { users } });
export const boundary = defineBoundary({ source: "api", expose: { "users.getAll": "query", "users.create": "mutation" } });`;

/** Each scenario a page builds, and its budget at start: minified and gzipped, in KiB. */
export const SCENARIOS = [
  { name: "definitions", code: `${DEFINE}\nconsole.log(api, boundary);`, budget: [25.5, 9.5] },
  {
    name: "direct caller",
    code: `${DEFINE}\nimport { createCaller } from "@noverax/courier";\ncreateCaller(api).users.getAll().then(console.log);`,
    budget: [116, 41],
  },
  {
    name: "proxy caller",
    code: `import { createProxyCaller } from "@noverax/courier";\ncreateProxyCaller("api").users.getAll().then(console.log);`,
    budget: [51, 18.6],
  },
  {
    name: "proxy caller with its boundary",
    code: `import { createProxyCaller } from "@noverax/courier";\nimport { defineBoundary } from "@noverax/courier/define";\nconst boundary = defineBoundary({ source: "api", expose: { "users.getAll": "query" } });\ncreateProxyCaller("api", { boundary }).users.getAll().then(console.log);`,
    budget: [52.6, 19.1],
  },
  {
    name: "React Query hooks",
    code: `import { createProxyQueryCaller } from "@noverax/courier-react";\nexport const q = createProxyQueryCaller("api");`,
    budget: [64.8, 23.8],
  },
];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export const PROVIDED = ["react", "react-dom", "@tanstack/react-query"];
