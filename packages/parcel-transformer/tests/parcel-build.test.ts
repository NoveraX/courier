/**
 * @vitest-environment node
 *
 * Parcel with the transformer, run in the app's folder as `parcel build`
 * is: a page's bundle carries the routes of every source and nothing of the
 * module the package ships, a bundle a browser runs fails where it takes the
 * config, and a build after an edit carries the edited routes, whatever
 * Parcel's cache kept. Requires a build of this package, of
 * `@noverax/courier-build` and of the core first.
 */
import { spawnSync } from "node:child_process";
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
import { afterEach, describe, expect, it } from "vitest";

/* The repository's packages, where a project's Parcel and Courier resolve from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

/* What builds a project, in its own folder: Parcel finds what changed by that folder. */
const BUILD_PAGE = resolve(import.meta.dirname, "fixtures/build-page.mjs");

/* Where the projects are made. Parcel reads what changed between two builds from the
   file system's journal of changes, which macOS keeps of /tmp but not of its per-user
   temporary folder; and it never looks for changes under node_modules. */
const PROJECTS = process.platform === "darwin" ? "/tmp" : tmpdir();

const APIS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  endpoints: {},
  groups: {
    cart: defineGroup({ endpoints: { add: endpoint.post("cart").expose(), view: endpoint.get("cart") } }),
  },
});
`;

const PARCELRC = `{
  "extends": "@parcel/config-default",
  "transformers": {
    "**/@noverax/courier/lib/routes/index.js": ["@noverax/parcel-transformer-courier", "..."],
    "**/core/lib/routes/index.js": ["@noverax/parcel-transformer-courier", "..."],
    "**/courier.config.{ts,mts,cts,js,mjs,cjs}": ["@noverax/parcel-transformer-courier", "..."]
  }
}
`;

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

/* The app's manifest, as one using the transformer writes it, with the transformer's options if any. */
function manifest(options?: { config: string }): string {
  return `${JSON.stringify({
    type: "module",
    devDependencies: { "@noverax/parcel-transformer-courier": "*" },
    "@parcel/resolver-default": { packageExports: true },
    ...(options === undefined ? {} : { "@noverax/parcel-transformer-courier": options }),
  })}\n`;
}

/* A project of a page and the API and Parcel's config, and the files given. */
function parcelProject(files: Record<string, string>): string {
  const made = realpathSync(mkdtempSync(join(PROJECTS, "courier-parcel-")));
  symlinkSync(REPO_NODE_MODULES, join(made, "node_modules"), "dir");
  const all: Record<string, string> = {
    "package.json": manifest(),
    "yarn.lock": "",
    ".parcelrc": PARCELRC,
    "courier.config.mjs":
      'import { shop } from "./src/apis.mjs";\n\nexport default { sources: { shop } };\n',
    "src/apis.mjs": APIS,
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    const file = join(made, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    const earlier = new Date(Date.now() - 60_000);
    utimesSync(file, earlier, earlier);
  }
  return made;
}

/* The script Parcel built from the project's page, its cache kept in the project between builds. */
function build(project: string): string {
  const run = spawnSync(process.execPath, [BUILD_PAGE], { cwd: project, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout;
}

/* A page that takes the shop's routes, through the script its HTML loads. */
const PAGE = {
  "index.html":
    '<!doctype html><html><body><script type="module" src="./src/page.mjs"></script></body></html>\n',
  "src/page.mjs":
    'import { routes } from "@noverax/courier/routes";\n\nglobalThis.shop = routes.shop;\n',
};

describe("the Parcel transformer", () => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", () => {
    root = parcelProject(PAGE);

    const code = build(root).replace(/\s/g, "");

    expect(code).toContain('"cart.add":{"type":"mutation"}');
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 120_000);

  it("builds the edited routes after an edit, whatever Parcel's cache kept", async () => {
    root = parcelProject(PAGE);
    const project = root;
    build(project);
    const apis = join(project, "src/apis.mjs");
    writeFileSync(
      apis,
      readFileSync(apis, "utf8").replace(
        'view: endpoint.get("cart")',
        'view: endpoint.get("cart").expose()',
      ),
    );

    /* Parcel reads what changed between builds from the file system's journal, which takes an
       edit a moment after it is saved: built again until it has, which a transformer that told
       Parcel nothing would never be. */
    await expect
      .poll(() => build(project).replace(/\s/g, ""), {
        timeout: 60_000,
        interval: 500,
      })
      .toContain('"cart.view":{"type":"query"}');
  }, 120_000);

  it("reads the config the app's package.json names, under the transformer's key", () => {
    root = parcelProject({
      ...PAGE,
      "package.json": manifest({ config: "config/routes.config.mjs" }),
      "config/routes.config.mjs":
        'import { shop } from "../src/apis.mjs";\n\nexport default { sources: { shop } };\n',
      "courier.config.mjs": "export default { sources: {} };\n",
    });

    const code = build(root).replace(/\s/g, "");

    expect(code).toContain('"cart.add":{"type":"mutation"}');
  }, 120_000);

  it("fails a browser's bundle that takes the config itself", () => {
    root = parcelProject({
      "index.html": PAGE["index.html"],
      "src/page.mjs":
        'import config from "../courier.config.mjs";\n\nglobalThis.sources = config.sources;\n',
    });

    const project = root;

    expect(() => build(project)).toThrow("courier.config.mjs is imported into a page as a value");
  }, 120_000);
});
