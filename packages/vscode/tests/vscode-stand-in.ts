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
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
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

export const workspace = {
  getWorkspaceFolder: (uri: { fsPath: string }) => ({
    uri: { fsPath: dirname(dirname(uri.fsPath)) },
  }),
};
