/**
 * Self-test for `scripts/check-npx-commands.mjs`: which commands npx, or
 * another runner that fetches from npm, would look up under a bare name,
 * and which run only the project's own copy or name their package in full.
 */

import { describe, expect, it } from "vitest";
import { bareCommands, findBareCommands } from "./check-npx-commands.mjs";

const commandsOf = (text) => bareCommands(text).map(({ command }) => command);

describe("a command run by its bare name", () => {
  it("is found after npx, bunx, npm exec, pnpm dlx and yarn dlx, flags or not", () => {
    expect(
      commandsOf(
        [
          "npx courier-studio",
          "npx -y courier-mcp --dotenv .env.local",
          "run: npx --yes -- courier-studio diff --base origin/main",
          "bunx courier-server --port 3001",
          "npm exec courier-studio verify",
          "pnpm dlx courier-mcp",
          "yarn dlx courier",
          "npx courier-cli routes --check",
        ].join("\n"),
      ),
    ).toEqual([
      "courier-studio",
      "courier-mcp",
      "courier-studio",
      "courier-server",
      "courier-studio",
      "courier-mcp",
      "courier",
      "courier-cli",
    ]);
  });

  it("is found in an editor's entry, as JSON, TOML or code, and in highlighted markup", () => {
    expect(
      commandsOf(
        [
          '"courier": { "command": "npx", "args": ["courier-mcp", "--dotenv", ".env.local"] }',
          'args = ["courier-mcp", "--cwd", "/path/to/project"]',
          'args: ["courier-mcp", "--dotenv", ".env.local"],',
          '<span className="text-code-keyword">npx</span> courier-studio',
        ].join("\n"),
      ),
    ).toEqual(["courier-mcp", "courier-mcp", "courier-mcp", "courier-studio"]);
  });

  it("is reported with its file and line", () => {
    const files = [
      { path: "docs/a.mdx", text: "Start it:\n\n```bash\nnpx courier-studio\n```" },
      { path: "docs/b.mdx", text: "npx @noverax/courier-studio" },
    ];

    expect(findBareCommands(files)).toEqual([
      { path: "docs/a.mdx", line: 4, command: "courier-studio" },
    ]);
  });
});

describe("a command that names its package, or runs only the project's copy", () => {
  it("passes", () => {
    expect(
      commandsOf(
        [
          "npx @noverax/courier-studio",
          "npx -y @noverax/courier-mcp --dotenv .env.local",
          "bunx @noverax/courier-studio",
          '"args": ["@noverax/courier-mcp", "--dotenv", ".env.local"]',
          "npx --package=@noverax/courier-mcp courier-mcp",
          "npx -p @noverax/courier-studio courier-studio verify",
          "npx @noverax/courier-cli routes --check",
          "pnpm exec courier-studio",
          "yarn courier-studio",
          '"studio": "courier-studio"',
          '"routes": "courier-cli routes"',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("passes for names that only begin like a command, and for prose and identifiers", () => {
    expect(
      commandsOf(
        [
          "npx create-courier@latest",
          "npx courier-studio-core",
          "`courier-mcp` serves the endpoints your project marks .agent()",
          'name: "courier-studio",',
          "app: courier-server",
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});
