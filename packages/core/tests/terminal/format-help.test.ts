/**
 * A command's help: title, summary, usage and an aligned column of options,
 * styled only where the stream shows colour.
 */
import { describe, expect, it } from "vitest";

import { formatHelp } from "../../src/terminal/format-help";
import { helpOptions } from "../../src/terminal/help-options";
import { createTerminalStyle } from "../../src/terminal/terminal-style";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;

const help = {
  product: "Courier Server",
  version: "1.0.0",
  summary: "Standalone HTTP, SSE and WebSocket server for Courier",
  command: "courier-server",
  options: helpOptions({
    port: { type: "string", valueHint: "port", description: "Server port" },
    open: { type: "boolean", description: "Open a browser" },
  }),
};

describe("formatHelp", () => {
  it("lists the title, the summary, the usage and every option", () => {
    const text = formatHelp(help, createTerminalStyle(0, true));

    expect(text).toContain("  Courier Server v1.0.0\n  Standalone HTTP");
    expect(text).toContain("  Usage\n    courier-server [options]");
    expect(text).toContain("    --port <port>    Server port");
    expect(text).toContain("    --open           Open a browser");
    expect(text).toContain("    -h, --help       Show this help");
    expect(text).toContain("    -v, --version    Show the version");
  });

  it("writes no escape code without colour, and the same text with it", () => {
    const coloured = formatHelp(help, createTerminalStyle(8, true));

    expect(formatHelp(help, createTerminalStyle(0, true))).not.toMatch(ESCAPE);
    expect(coloured.replace(ESCAPE, "")).toBe(formatHelp(help, createTerminalStyle(0, true)));
  });

  it("lists the commands a CLI takes under its usage, each beside what it does", () => {
    const withCommands = {
      ...help,
      commands: [{ name: "openapi", description: "Write the sources as OpenAPI documents" }],
    };

    const text = formatHelp(withCommands, createTerminalStyle(0, true));

    expect(text).toContain(
      "    courier-server [options]\n    courier-server <command> [options]\n\n  Commands\n    openapi    Write the sources as OpenAPI documents",
    );
    expect(formatHelp(help, createTerminalStyle(0, true))).not.toContain("Commands");
  });

  it("dims the value a flag takes, and paints the flag", () => {
    const text = formatHelp(help, createTerminalStyle(8, true));

    expect(text).toContain("\x1b[36m--port\x1b[39m \x1b[2m<port>\x1b[22m");
  });
});

describe("helpOptions", () => {
  it("names a value after its hint, else after the option, and leaves out positionals", () => {
    const options = helpOptions({
      config: { type: "string", valueHint: "file" },
      host: { type: "string" },
      target: { type: "positional" },
    });

    expect(options.map((option) => option.flags)).toEqual([
      "--config <file>",
      "--host <host>",
      "-h, --help",
      "-v, --version",
    ]);
  });
});
