/*
 * The few parts of VS Code's API the extension uses, standing in for the
 * editor in tests that run outside it.
 */
import { dirname } from "node:path";

type Listener<TEvent> = (event: TEvent) => void;

export class EventEmitter<TEvent> {
  private readonly listeners = new Set<Listener<TEvent>>();
  readonly event = (listener: Listener<TEvent>) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: TEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(start: number | Position, from: number | Position, endLine?: number, end?: number) {
    this.start =
      typeof start === "number" ? new Position(start, typeof from === "number" ? from : 0) : start;
    this.end = typeof from === "number" ? new Position(endLine ?? 0, end ?? 0) : from;
  }
  contains(position: Position): boolean {
    const after =
      position.line > this.start.line ||
      (position.line === this.start.line && position.character >= this.start.character);
    const before =
      position.line < this.end.line ||
      (position.line === this.end.line && position.character <= this.end.character);
    return after && before;
  }
}

export class CodeLens {
  constructor(
    readonly range: Range,
    readonly command?: { title: string; command: string; tooltip?: string; arguments?: unknown[] },
  ) {}
}

export class MarkdownString {
  constructor(readonly value: string) {}
}

export class Hover {
  readonly contents: MarkdownString[];
  constructor(
    contents: MarkdownString | MarkdownString[],
    readonly range?: Range,
  ) {
    this.contents = Array.isArray(contents) ? contents : [contents];
  }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class ThemeIcon {
  static readonly File = new ThemeIcon("file");
  constructor(
    readonly id: string,
    readonly color?: ThemeColor,
  ) {}
}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
    private readonly text: string,
  ) {}
  static file(path: string): Uri {
    return new Uri("file", path, `file://${path}`);
  }
  static parse(text: string): Uri {
    return new Uri(new URL(text).protocol.slice(0, -1), "", text);
  }
  with(change: { fragment: string }): Uri {
    return new Uri(this.scheme, this.fsPath, `${this.text.split("#")[0]}#${change.fragment}`);
  }
  toString(): string {
    return this.text;
  }
}

export class Location {
  constructor(
    readonly uri: Uri,
    readonly range: Range | Position,
  ) {}
}

export const SymbolKind = { Method: 5, Function: 11 } as const;

export class SymbolInformation {
  constructor(
    readonly name: string,
    readonly kind: number,
    readonly containerName: string,
    readonly location: Location,
  ) {}
}

export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: string | MarkdownString;
  iconPath?: ThemeIcon;
  contextValue?: string;
  resourceUri?: Uri;
  command?: { title: string; command: string; arguments?: unknown[] };
  constructor(
    readonly label: string,
    readonly collapsibleState: number = TreeItemCollapsibleState.None,
  ) {}
}

interface Held {
  dispose(): unknown;
}

export const Disposable = {
  from: (...held: Held[]): Held => ({ dispose: () => held.map((each) => each.dispose()) }),
};

/** The settings the code reads, by their full key: `courier.studio.url`. */
export const settings = new Map<string, unknown>();

export const workspace = {
  getWorkspaceFolder: (uri: { fsPath: string }) => ({
    uri: { fsPath: dirname(dirname(uri.fsPath)) },
  }),
  getConfiguration: (section: string) => ({
    get: (key: string, fallback?: unknown) => settings.get(`${section}.${key}`) ?? fallback,
  }),
  onDidChangeConfiguration: () => ({ dispose: () => undefined }),
};

/** What the code showed the user, and the pages it opened. */
export const shown = { warnings: [] as string[], opened: [] as string[] };

export const window = {
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  showWarningMessage: async (message: string) => {
    shown.warnings.push(message);
    return undefined;
  },
};

export const env = {
  openExternal: async (uri: Uri) => {
    shown.opened.push(uri.toString());
    return true;
  },
};

/** The commands registered, by name, as the code registered them. */
export const registered = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
  registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
    registered.set(name, handler);
    return { dispose: () => registered.delete(name) };
  },
  executeCommand: async () => undefined,
};

/** VS Code's agent API, which a test fills in as the editor at hand would. */
export const lm: {
  registerMcpServerDefinitionProvider?: ((id: string, provider: unknown) => Held) | undefined;
} = {};

export class McpStdioServerDefinition {
  cwd?: Uri;
  constructor(
    readonly label: string,
    readonly command: string,
    readonly args: string[] = [],
    readonly env: Record<string, string> = {},
    readonly version?: string,
  ) {}
}
