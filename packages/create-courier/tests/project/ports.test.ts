import { afterAll, describe, expect, it } from "vitest";

import { portsOf } from "../../src/project/ports";
import { readProject } from "../../src/project/read-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const CHOICES = { studio: true, mocks: true, mcp: false };

describe("portsOf", () => {
  it("keeps the ports a project set up before names in Courier's files", async () => {
    const root = projectWith({
      "package.json": "{}",
      "courier.config.ts":
        "export default defineConfig({ sources: { api },\n  studio: { port: 6291 },\n});\n",
      "courier.mocks.ts": "defineMockServer({ source: api, port: 7011, autoStart: true })\n",
    });

    expect(await portsOf(readProject(root), CHOICES)).toEqual({ studio: 6291, mock: 7011 });
  });

  it("keeps the defaults for a project whose config names none", async () => {
    const root = projectWith({
      "package.json": "{}",
      "courier.config.ts": "export default {};\n",
      "courier.mocks.ts": "x\n",
    });

    expect(await portsOf(readProject(root), CHOICES)).toEqual({ studio: 6280, mock: 7001 });
  });
});
