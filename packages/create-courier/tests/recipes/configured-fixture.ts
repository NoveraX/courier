/* Projects set up already, by hand or by the command, and what a plan still offers in them. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { frameworkById } from "../../src/frameworks";
import { buildPlan, type Plan } from "../../src/plan/build-plan";
import { contextOf, projectWith } from "./project-fixture";

const { version } = await import("../../package.json");
export const RANGE = version === "0.0.0" ? "*" : `^${version}`;
const COURIER = [
  "@noverax/courier",
  "@noverax/courier-nestjs",
  "@noverax/courier-fastify",
  "@noverax/courier-hono",
  "@noverax/courier-express",
  "@noverax/courier-remix",
  "@noverax/courier-next",
  "@noverax/courier-react",
  "@noverax/courier-studio-core",
  "@noverax/courier-studio",
  "@noverax/courier-cli",
  "@noverax/courier-mock",
];

export function manifestWith(framework: Record<string, string>): string {
  const courier = Object.fromEntries(COURIER.map((name) => [name, RANGE]));
  return JSON.stringify({
    name: "app",
    scripts: { dev: "dev", studio: "courier-studio", routes: "courier-cli routes" },
    dependencies: { ...framework, ...courier, zod: "^4.1.0", "fastify-plugin": "^5.0.0" },
    devDependencies: {
      typescript: "^6.0.3",
      hono: "^4.9.0",
      "@hono/node-server": "^1.19.0",
      "@tanstack/react-query": "^5.0.0",
    },
  });
}

export function planAt(root: string, id: string, marker: string): Plan {
  const ctx = contextOf(root, marker);
  const recipe = frameworkById(id).recipe;
  if (recipe === undefined) throw new Error(`${id} has no recipe`);
  return buildPlan(ctx, recipe(ctx));
}

export function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/* The project once the command wrote its files, the steps it left not taken. */
export function setUp(id: string, marker: string, files: Record<string, string>): string {
  const root = projectWith(files);
  const plan = planAt(root, id, marker);
  write(
    root,
    Object.fromEntries(
      plan.files.filter((file) => file.state === "create").map((file) => [file.path, file.content]),
    ),
  );
  return root;
}

export function offered(plan: Plan): string[] {
  return [
    ...plan.files
      .filter((file) => file.state === "create" || file.state === "kept")
      .map((file) => `${file.state} ${file.path}`),
    ...plan.edits.filter((edit) => edit.state === "edit").map((edit) => `edit ${edit.path}`),
    ...plan.manual
      .filter((step) => step.file !== "tsconfig.json")
      .map((step) => `step ${step.file}`),
  ];
}
