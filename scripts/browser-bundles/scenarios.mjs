/**
 * What a page takes from Courier, as the documentation shows it: the
 * shared definitions, a direct caller, a proxy caller with the routes
 * Studio writes, and React Query hooks with either.
 *
 * Each bundler has a budget, minified and gzipped, in KiB: what the
 * scenario measured under it when the budget was set, and a little room.
 * A change that grows a page past one either earns its bytes, and the
 * budget is raised here with the reason in the commit, or is made smaller.
 * Turbopack's is measured by the framework matrix's Next.js application;
 * it is no larger than esbuild's was before the bundlers had their own.
 */

const DEFINE = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: {
  getAll: endpoint.get("").response(), getById: endpoint.get(":id").variables().response(),
  create: endpoint.post("").variables().response() } });
export const api = defineApi({ baseURL: "https://api.example.com", expose: true, groups: { users } });`;

/* The routes module Courier writes for that API: data alone, which a page imports. */
const ROUTES = `const apiRoutes = { source: "api", endpoints: {
  "users.create": { type: "mutation" }, "users.getAll": { type: "query" }, "users.getById": { type: "query" } } };`;

/** Each scenario a page builds, and its budget at start: minified and gzipped, in KiB. */
export const SCENARIOS = [
  {
    name: "definitions",
    code: `${DEFINE}\nconsole.log(api);`,
    budget: {
      esbuild: [20.8, 8.1],
      webpack: [20.8, 8.1],
      vite: [20.8, 8.1],
      turbopack: [20.8, 8.1],
    },
  },
  {
    name: "direct caller",
    code: `${DEFINE}\nimport { createCaller } from "@noverax/courier/client";\ncreateCaller(api).users.getAll().then(console.log);`,
    budget: {
      esbuild: [93.5, 33.3],
      webpack: [96, 33.2],
      vite: [92.5, 32.6],
      turbopack: [102.5, 36.1],
    },
  },
  {
    name: "proxy caller with its routes",
    code: `import { createProxyCaller } from "@noverax/courier/client";\n${ROUTES}\ncreateProxyCaller(apiRoutes).users.getAll().then(console.log);`,
    budget: {
      esbuild: [42.5, 15.8],
      webpack: [41, 15],
      vite: [40.5, 14.8],
      turbopack: [45.6, 16.5],
    },
  },
  {
    name: "React Query hooks",
    code: `import { createProxyQueryCaller } from "@noverax/courier-react";\n${ROUTES}\nexport const q = createProxyQueryCaller(apiRoutes);`,
    budget: { esbuild: [46.7, 17.4], webpack: [44, 16], vite: [43.5, 16], turbopack: [49.9, 18.2] },
  },
  {
    name: "React Query hooks, direct",
    code: `${DEFINE}\nimport { createQueryCaller } from "@noverax/courier-react";\nexport const q = createQueryCaller(api);`,
    budget: {
      esbuild: [98.2, 35.3],
      webpack: [101, 34.9],
      vite: [97, 34.2],
      turbopack: [102.5, 36.1],
    },
  },
];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export const PROVIDED = ["react", "react-dom", "@tanstack/react-query"];
