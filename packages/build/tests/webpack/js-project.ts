import { type TempProject, tempProject } from "../vite/temp-project";

/** The shop and the payments of the Vite tests, as JavaScript a bundler parses without a loader. */
export const APIS_JS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  endpoints: { search: endpoint.get("search").expose(process.env.SHOP_SEARCH_PUBLIC === "1") },
  groups: {
    cart: defineGroup({ endpoints: { add: endpoint.post("cart").expose(), view: endpoint.get("cart") } }),
  },
});

export const payments = defineApi({
  baseURL: "https://pay.example.com",
  endpoints: { charge: endpoint.post("charge") },
});
`;

/** Their config. */
export const CONFIG_JS = `import { payments, shop } from "./src/apis.mjs";

export default { sources: { shop, payments } };
`;

/** A page that takes the routes Courier builds. */
export const PAGE_JS = `import { routes } from "@noverax/courier/routes";

export const shop = routes.shop;
`;

/** A page that takes the config itself, which a page's bundle must not. */
export const CONFIG_PAGE_JS = `import config from "../courier.config.mjs";

export const sources = Object.keys(config.sources);
`;

/**
 * A project of those files, and any more given.
 *
 * @param files - More files, from the root, and their content
 * @returns The project
 * @example
 * ```ts
 * const project = jsProject({ "src/page.mjs": PAGE_JS });
 * ```
 */
export function jsProject(files: Record<string, string> = {}): TempProject {
  return tempProject({ "courier.config.mjs": CONFIG_JS, "src/apis.mjs": APIS_JS, ...files });
}
