import { afterAll, describe, expect, it } from "vitest";

import { agentsPolicyEdit, configObjectPath } from "../src/agents-policy-edit";
import { readProject } from "../src/project/read-project";
import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function projectOf(files: Record<string, string>) {
  return readProject(projectWith({ "package.json": manifest({}), ...files }));
}

describe("the agents policy --mcp adds to a config", () => {
  it("opens the config's object with every read offered, in the file's own indent", () => {
    const project = projectOf({ "courier.config.ts": "" });
    const { change } = agentsPolicyEdit(project);

    expect(change("export default defineConfig({\n\tsources: { api },\n});\n")).toBe(
      'export default defineConfig({\n\tagents: { offer: "reads" },\n\tsources: { api },\n});\n',
    );
    expect(change("export default { sources: { api } };\n")).toBe(
      'export default { agents: { offer: "reads" }, sources: { api } };\n',
    );
  });

  it("leaves a config that says already what agents may call, and one whose object it cannot find", () => {
    const project = projectOf({ "courier.config.ts": "" });
    const { change, manual } = agentsPolicyEdit(project);
    const marked =
      'export default defineConfig({\n  sources: { api },\n  agents: { offer: "marked" },\n});\n';

    expect(change(marked)).toBe(marked);
    expect(change("module.exports = config;\n")).toBeUndefined();
    expect(manual).toMatchObject({
      file: "courier.config.ts",
      lines: ['agents: { offer: "reads" },'],
    });
  });

  it("edits the module a config passes its list on from", () => {
    const project = projectOf({
      "courier.config.ts": 'export { default } from "./src/courier/config.js";\n',
      "src/courier/config.ts": "export default defineConfig({ sources: {} });\n",
    });

    expect(configObjectPath(project)).toBe("src/courier/config.ts");
    expect(agentsPolicyEdit(project).path).toBe("src/courier/config.ts");
  });
});
