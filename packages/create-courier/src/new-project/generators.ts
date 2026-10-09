import type { FrameworkId } from "../frameworks";
import type { PackageManagerName } from "../project/package-manager";

/** How a framework's own generator makes a new project, run without a question. */
export interface Generator {
  /** The generator's arguments after `npx --yes`, the project's folder among them. */
  readonly args: readonly string[];
  /** Whether it leaves the install to the command, which installs with the person's package manager. */
  readonly install: boolean;
}

/**
 * The generators, each at the major the setup is checked against: a new
 * major waits until the setup is checked with it.
 */
const SPECS = {
  next: "create-next-app@16",
  nuxt: "create-nuxt@4",
  sveltekit: "sv@1",
  astro: "create-astro@5",
  reactRouter: "create-react-router@8",
  solid: "create-solid@0.12",
  expo: "create-expo-app@5",
  nest: "@nestjs/cli@12",
  hono: "create-hono@0.19",
  fastify: "fastify-cli@8",
  vite: "create-vite@9",
} as const;

/**
 * The generator for a new project of a framework, in a folder of that name
 * beside where it runs. Express has no generator of its own: the command
 * writes a minimal server instead.
 *
 * @param framework - The framework
 * @param dir - The new project's folder, as the generator is given it
 * @param manager - The package manager the project installs with
 * @returns The generator, or `undefined` for Express
 * @example
 * ```ts
 * generatorFor("next", "shop", "pnpm")?.args; // ["create-next-app@16", "shop", "--yes", "--use-pnpm"]
 * ```
 */
export function generatorFor(
  framework: FrameworkId,
  dir: string,
  manager: PackageManagerName,
): Generator | undefined {
  switch (framework) {
    case "next":
      return { args: [SPECS.next, dir, "--yes", `--use-${manager}`], install: false };
    case "nuxt":
      return {
        args: [
          SPECS.nuxt,
          dir,
          "--template",
          "minimal",
          "--packageManager",
          manager,
          "--gitInit",
          "--no-install",
        ],
        install: true,
      };
    case "sveltekit":
      return {
        args: [
          SPECS.sveltekit,
          "create",
          dir,
          "--template",
          "minimal",
          "--types",
          "ts",
          "--no-add-ons",
          "--no-install",
        ],
        install: true,
      };
    case "astro":
      return {
        args: [
          SPECS.astro,
          dir,
          "--template",
          "minimal",
          "--no-install",
          "--git",
          "--yes",
          "--skip-houston",
        ],
        install: true,
      };
    case "react-router":
    case "remix":
      return {
        args: [
          SPECS.reactRouter,
          dir,
          "--yes",
          "--no-install",
          "--git-init",
          "--package-manager",
          manager,
        ],
        install: true,
      };
    case "solid-start":
      return {
        args: [SPECS.solid, dir, "--solidstart", "--v2", "--ts", "-t", "basic"],
        install: true,
      };
    case "expo":
      return { args: [SPECS.expo, dir, "--yes", "--no-install"], install: true };
    case "nestjs":
      return {
        args: [SPECS.nest, "new", dir, "--package-manager", manager, "--no-observe"],
        install: false,
      };
    case "hono":
      return {
        args: [SPECS.hono, dir, "--template", "nodejs", "--pm", manager, "--install"],
        install: false,
      };
    case "fastify":
      return { args: [SPECS.fastify, "generate", dir, "--lang=ts"], install: true };
    case "react":
      return {
        args: [SPECS.vite, dir, "--template", "react-ts", "--no-interactive"],
        install: true,
      };
    case "vue":
      return { args: [SPECS.vite, dir, "--template", "vue-ts", "--no-interactive"], install: true };
    case "express":
      return undefined;
  }
}
