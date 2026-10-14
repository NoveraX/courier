/**
 * What a page takes from Courier, as the documentation shows it: the
 * shared definitions, a direct caller, a proxy caller with the routes
 * Studio writes, and React Query hooks with them.
 *
 * A budget is what the scenario measured when it was set, and a little
 * room: a change that grows a page past it either earns its bytes, and the
 * budget is raised here with the reason in the commit, or is made smaller.
 */

const DEFINE = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: {
  getAll: endpoint.get("").response(), getById: endpoint.get(":id").variables().response(),
  create: endpoint.post("").variables().response() } });
export const api = defineApi({ baseURL: "https://api.example.com", expose: true, groups: { users } });`;

/* The routes module Studio writes for that API: data alone, which a page imports. */
const ROUTES = `const apiRoutes = { source: "api", endpoints: {
  "users.create": { type: "mutation" }, "users.getAll": { type: "query" }, "users.getById": { type: "query" } } };`;

/** Each scenario a page builds, and its budget at start: minified and gzipped, in KiB. */
export const SCENARIOS = [
  { name: "definitions", code: `${DEFINE}\nconsole.log(api);`, budget: [21.8, 8.3] },
  {
    name: "direct caller",
    code: `${DEFINE}\nimport { createCaller } from "@noverax/courier";\ncreateCaller(api).users.getAll().then(console.log);`,
    budget: [102, 35.6],
  },
  {
    name: "proxy caller with its routes",
    code: `import { createProxyCaller } from "@noverax/courier";\n${ROUTES}\ncreateProxyCaller(apiRoutes).users.getAll().then(console.log);`,
    budget: [44.5, 16.1],
  },
  {
    name: "React Query hooks",
    code: `import { createProxyQueryCaller } from "@noverax/courier-react";\n${ROUTES}\nexport const q = createProxyQueryCaller(apiRoutes);`,
    budget: [56.5, 20.6],
  },
];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export const PROVIDED = ["react", "react-dom", "@tanstack/react-query"];
