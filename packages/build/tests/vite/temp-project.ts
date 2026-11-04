import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/* The repository's packages, where a project's `@noverax/courier`, Vite and Vitest resolve from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

/** The definitions every project here starts from: a shop that opens its cart's `add`, and payments that open nothing. */
export const APIS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

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

/** The config of those definitions. */
export const CONFIG = `import { payments, shop } from "./src/apis";

export default { sources: { shop, payments } };
`;

/** A project on disk, its packages those of the repository. */
export interface TempProject {
  readonly root: string;
  /** Write a file, from the root, its folders made; saved a minute ago, as an unchanged file is. */
  write(path: string, content: string): void;
  /** Change a file, from the root, as an edit saves it now. */
  edit(path: string, change: (content: string) => string): void;
  remove(): void;
}

/**
 * Make a project in a folder of its own: `package.json` of an ES module
 * package, the repository's `node_modules`, and the files given.
 *
 * @param files - Each file, from the root, and its content
 * @returns The project
 * @example
 * ```ts
 * const project = tempProject({ "courier.config.ts": CONFIG, "src/apis.ts": APIS });
 * ```
 */
export function tempProject(files: Record<string, string>): TempProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-routes-plugin-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
  const write = (path: string, content: string): void => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    const earlier = new Date(Date.now() - 60_000);
    utimesSync(file, earlier, earlier);
  };
  write("package.json", '{ "type": "module" }\n');
  for (const [path, content] of Object.entries(files)) write(path, content);
  return {
    root,
    write,
    edit: (path, change) => {
      const file = join(root, path);
      writeFileSync(file, change(readFileSync(file, "utf8")));
    },
    /* A dev server's dependency optimizer may still be writing node_modules/.vite as the server closes. */
    remove: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}
