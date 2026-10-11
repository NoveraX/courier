import { isAbsolute } from "node:path";

/** What the panel's page passes on: Studio's requests, and the panel's own buttons. */
export type PanelMessage =
  | {
      readonly type: "open-file";
      readonly path: string;
      readonly line: number;
      readonly column: number;
    }
  | { readonly type: "open-external"; readonly url: string }
  | { readonly type: "location"; readonly path: string }
  | { readonly type: "command"; readonly command: string };

/**
 * A message from the panel's page, checked: a file to open by its absolute
 * path at a line and column from 1, a web page by its `http(s)` address,
 * the page Studio shows, or a button's command. Anything else is no
 * message — Studio's page shows what others wrote, so its words are read
 * as data.
 *
 * @param data - What the page sent
 * @returns The message, or `undefined`
 * @example
 * ```ts
 * panelMessage({ source: "courier-studio", type: "open-file", path: "/work/a.ts", line: 3, column: 1 });
 * ```
 */
export function panelMessage(data: unknown): PanelMessage | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const field = (key: string): unknown => Reflect.get(data, key);
  const type = field("type");
  if (type === "open-file") {
    const [path, line, column] = [field("path"), field("line"), field("column")];
    if (typeof path !== "string" || !isAbsolute(path) || !place(line) || !place(column))
      return undefined;
    return { type, path, line, column };
  }
  if (type === "open-external") {
    const url = field("url");
    return typeof url === "string" && /^https?:\/\//.test(url) ? { type, url } : undefined;
  }
  if (type === "location") {
    const path = field("path");
    return typeof path === "string" ? { type, path } : undefined;
  }
  const command = field("command");
  return type === "command" && typeof command === "string" ? { type, command } : undefined;
}

function place(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
