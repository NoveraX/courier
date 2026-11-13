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
 * reason in the commit, or is made smaller.
 *
 * The framework matrix measures a page as Next.js builds it on three
 * targets, each with a budget under its id, by the same rule: Next.js 16
 * with Turbopack and with webpack, and Next.js 15 with Turbopack. Each
 * installs a release of Next.js, React and React Query rather than a
 * range. Turbopack then builds the same bytes on every machine, so a run
 * measures what the last one did; webpack's build of the same releases can
 * come out some tens of bytes apart on another machine — up to 69 gzipped
 * so far — which the rule's 1 % of room covers. Should CI ever measure
 * more, the budget goes up as any budget does: in a commit of its own
 * that says why. A new release goes in a commit of its own, with what it
 * measures.
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
      "next-16": [16.5, 6.7],
      "next-15-turbopack": [19.5, 7.4],
      "next-16-webpack": [16, 6.5],
    },
  },
  {
    name: "direct caller",
    code: `${DEFINE}\nimport { createCaller } from "@noverax/courier/client";\ncreateCaller(api).users.getAll().then(console.log);`,
    budget: {
      esbuild: [84.4, 30],
      webpack: [86.5, 29.8],
      vite: [84, 29.6],
      "next-16": [85.8, 30.8],
      "next-15-turbopack": [100.9, 33.9],
      "next-16-webpack": [82.8, 29.5],
    },
  },
  {
    name: "proxy caller with its routes",
    code: `import { createProxyCaller } from "@noverax/courier/client";\n${ROUTES}\ncreateProxyCaller(apiRoutes).users.getAll().then(console.log);`,
    budget: {
      esbuild: [39.5, 14.7],
      webpack: [38, 14.1],
      vite: [36.7, 13.7],
      "next-16": [40.8, 15.2],
      "next-15-turbopack": [47.1, 16.6],
      "next-16-webpack": [39, 14.6],
    },
  },
  {
    name: "React Query hooks",
    code: `import { createProxyQueryCaller } from "@noverax/courier-react";\n${ROUTES}\nexport const q = createProxyQueryCaller(apiRoutes);`,
    budget: {
      esbuild: [42.8, 16.1],
      webpack: [40.8, 15.1],
      vite: [40.5, 15],
      "next-16": [43.2, 16.2],
      "next-15-turbopack": [49.5, 17.6],
      "next-16-webpack": [41.4, 15.5],
    },
  },
  {
    name: "React Query hooks, direct",
    code: `${DEFINE}\nimport { createQueryCaller } from "@noverax/courier-react";\nexport const q = createQueryCaller(api);`,
    budget: {
      esbuild: [89.5, 31.9],
      webpack: [91.3, 31.6],
      vite: [88.7, 31.2],
      "next-16": [90.1, 32.1],
      "next-15-turbopack": [105.4, 35.9],
      "next-16-webpack": [87.1, 31.1],
    },
  },
];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export const PROVIDED = ["react", "react-dom", "@tanstack/react-query"];
