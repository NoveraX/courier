import { afterAll, describe, expect, it } from "vitest";

import { mcpJsonEntry } from "../src/mcp-json-entry";
import { readProject } from "../src/project/read-project";
import { projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

const COURIER = { command: "npx", args: ["@noverax/courier-mcp"] };

function changed(text: string): string | undefined {
  const edit = mcpJsonEntry(readProject(projectWith({ "package.json": "{}", ".mcp.json": text })))
    .edits[0];
  return edit?.change(text);
}

describe("mcpJsonEntry", () => {
  it("adds .mcp.json with Courier's server to a project without one", () => {
    const entry = mcpJsonEntry(readProject(projectWith({ "package.json": "{}" })));

    expect(entry.edits).toEqual([]);
    expect(JSON.parse(entry.files[0]?.content ?? "")).toEqual({ mcpServers: { courier: COURIER } });
  });

  it("adds Courier's server beside the servers the project's .mcp.json lists, as valid JSON", () => {
    const text = `{\n  "mcpServers": {\n    "github": { "command": "github-mcp-server", "args": ["stdio"] }\n  }\n}\n`;

    const after = changed(text);

    expect(JSON.parse(after ?? "")).toEqual({
      mcpServers: {
        github: { command: "github-mcp-server", args: ["stdio"] },
        courier: COURIER,
      },
    });
  });

  it("adds the list of servers to a .mcp.json without one, and leaves one that has Courier's as it is", () => {
    const empty = changed('{ "inputs": [] }\n');
    const already = `{ "mcpServers": { "courier": { "command": "npx", "args": ["@noverax/courier-mcp"] } } }\n`;

    expect(JSON.parse(empty ?? "")).toEqual({ inputs: [], mcpServers: { courier: COURIER } });
    expect(changed(already)).toBe(already);
  });

  it("leaves a .mcp.json it cannot read to the person, with the line to add", () => {
    const entry = mcpJsonEntry(
      readProject(projectWith({ "package.json": "{}", ".mcp.json": "[]\n" })),
    );

    expect(entry.edits[0]?.change("[]\n")).toBeUndefined();
    expect(entry.edits[0]?.manual.lines[0]).toContain('"courier": { "command": "npx"');
  });
});
