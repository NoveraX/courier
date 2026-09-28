import { endpointLines } from "./endpoint-lines";

/**
 * The code of each endpoint a group's or a flat API's file declares, read
 * from its syntax, whatever builder it starts from and however many lines
 * it takes.
 *
 * @param fileContent - The file's text
 * @returns Each endpoint's name and its lines, from its name to its end
 * @example
 * ```ts
 * extractEndpoints(file).searchUsers; // '    searchUsers: endpoint\n      .post("search")…'
 * ```
 */
export function extractEndpoints(fileContent: string): Record<string, string> {
  const lines = fileContent.split("\n");
  const result: Record<string, string> = {};
  for (const entry of endpointLines(fileContent)) {
    result[entry.name] = lines.slice(entry.start, entry.end + 1).join("\n");
  }
  return result;
}
