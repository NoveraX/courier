/**
 * What a page takes from Courier, as the documentation shows it: the
 * shared definitions, a direct caller, a proxy caller with the routes
 * Studio writes, and React Query hooks with either.
 *
 * Each bundler has a budget, minified and gzipped, in KiB: what the
 * scenario measured under it, plus 1 %, rounded up to a tenth of a KiB —
 * the two each on their own. A budget set by that rule only comes down:
 * where the rule would raise one, it stays. A change that grows a page
 * past one either earns its bytes, and the budget is raised here with the
 * reason in the commit, or is made smaller. Turbopack's is measured by the
 * framework matrix's Next.js application, under the same rule.
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
      esbuild: [12.3, 5.1],
      webpack: [12.1, 5],
      vite: [12.2, 5],
      turbopack: [16.8, 6.8],
    },
  },
  {
    name: "direct caller",
    code: `${DEFINE}\nimport { createCaller } from "@noverax/courier/client";\ncreateCaller(api).users.getAll().then(console.log);`,
    budget: {
      esbuild: [84.4, 30],
      webpack: [86.5, 29.8],
      vite: [84, 29.6],
      turbopack: [88.3, 31.2],
    },
  },
  {
    name: "proxy caller with its routes",
    code: `import { createProxyCaller } from "@noverax/courier/client";\n${ROUTES}\ncreateProxyCaller(apiRoutes).users.getAll().then(console.log);`,
    budget: {
      esbuild: [40.9, 15.3],
      webpack: [39, 14.4],
      vite: [37.8, 14.1],
      turbopack: [44.3, 16.3],
    },
  },
  {
    name: "React Query hooks",
    code: `import { createProxyQueryCaller } from "@noverax/courier-react";\n${ROUTES}\nexport const q = createProxyQueryCaller(apiRoutes);`,
    budget: {
      esbuild: [44.2, 16.6],
      webpack: [41.9, 15.5],
      vite: [41.4, 15.4],
      turbopack: [46.7, 17.2],
    },
  },
  {
    name: "React Query hooks, direct",
    code: `${DEFINE}\nimport { createQueryCaller } from "@noverax/courier-react";\nexport const q = createQueryCaller(api);`,
    budget: {
      esbuild: [89.5, 31.9],
      webpack: [91.3, 31.6],
      vite: [88.7, 31.1],
      turbopack: [92.5, 32.6],
    },
  },
];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export const PROVIDED = ["react", "react-dom", "@tanstack/react-query"];
