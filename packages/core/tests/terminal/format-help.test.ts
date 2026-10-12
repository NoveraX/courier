/**
 * A command's help: title, summary, usage, an aligned column of arguments and
 * options, and examples, styled only where the stream shows colour.
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

  it("colours an option whose value hint never closes, however long, at once", () => {
    const long = {
      ...help,
      options: helpOptions({
        port: { type: "string", valueHint: "<".repeat(200_000), description: "Server port" },
      }),
    };
    const coloured = formatHelp(long, createTerminalStyle(8, true));

    expect(coloured.replace(ESCAPE, "")).toBe(formatHelp(long, createTerminalStyle(0, true)));
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

  it("lists the arguments a command takes by position in the options' column, above them", () => {
    const withArguments = {
      ...help,
      command: "courier-server [dir]",
      arguments: [{ flags: "[dir]", description: "The project's folder" }],
    };

    const text = formatHelp(withArguments, createTerminalStyle(0, true));

    expect(text).toContain(
      "    courier-server [dir] [options]\n\n  Arguments\n    [dir]            The project's folder\n\n  Options\n    --port <port>    Server port",
    );
  });

  it("lists examples under the options, each command beside what it does", () => {
    const withExamples = {
      ...help,
      examples: [
        { command: "courier-server", description: "Serve on the default port" },
        { command: "courier-server --port 8080", description: "Serve on 8080" },
      ],
    };

    const text = formatHelp(withExamples, createTerminalStyle(0, true));

    expect(text).toContain(
      "    -v, --version    Show the version\n\n  Examples\n    courier-server                Serve on the default port\n    courier-server --port 8080    Serve on 8080\n",
    );
  });

  it("leaves out the sections it has nothing for", () => {
    const text = formatHelp(help, createTerminalStyle(0, true));

    expect(text).not.toContain("Arguments");
    expect(text).not.toContain("Examples");
    expect(text.endsWith("    -v, --version    Show the version\n")).toBe(true);
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
