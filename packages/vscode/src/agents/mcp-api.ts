import * as vscode from "vscode";

/** A server VS Code's agent starts on its own, over stdio — VS Code's `McpStdioServerDefinition`. */
export interface McpStdioDefinition {
  cwd?: vscode.Uri | undefined;
}

type McpStdioDefinitionClass = new (
  label: string,
  command: string,
  args?: string[],
  env?: Record<string, string>,
  version?: string,
) => McpStdioDefinition;

/** What offers VS Code's agent its servers — VS Code's `McpServerDefinitionProvider`. */
export interface McpProvider {
  readonly onDidChangeMcpServerDefinitions?: vscode.Event<void>;
  provideMcpServerDefinitions(token: vscode.CancellationToken): Promise<McpStdioDefinition[]>;
}

/** The part of VS Code's MCP API the extension uses. */
export interface McpApi {
  readonly Definition: McpStdioDefinitionClass;
  register(id: string, provider: McpProvider): vscode.Disposable;
}

/**
 * VS Code's API for offering MCP servers to its agent — from VS Code 1.101
 * on — or `undefined` in an editor without it: an older VS Code, or a fork
 * that configures its agent's servers its own way.
 *
 * @returns The API, or `undefined`
 * @example
 * ```ts
 * mcpApi()?.register("courier", provider);
 * ```
 */
export function mcpApi(): McpApi | undefined {
  const lm: unknown = Reflect.get(vscode, "lm");
  if (!isObject(lm)) return undefined;
  const register: unknown = Reflect.get(lm, "registerMcpServerDefinitionProvider");
  const Definition: unknown = Reflect.get(vscode, "McpStdioServerDefinition");
  if (typeof register !== "function" || !isDefinitionClass(Definition)) return undefined;
  return {
    Definition,
    register(id, provider) {
      const registered: unknown = Reflect.apply(register, lm, [id, provider]);
      return isDisposable(registered) ? registered : { dispose: () => undefined };
    },
  };
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/* VS Code's own class, checked to be one: what it constructs is its definition. */
function isDefinitionClass(value: unknown): value is McpStdioDefinitionClass {
  return typeof value === "function";
}

function isDisposable(value: unknown): value is vscode.Disposable {
  return isObject(value) && typeof Reflect.get(value, "dispose") === "function";
}
