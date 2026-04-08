/**
 * Mock-server file generation helpers used by `useMockGenerator`.
 *
 * Builds the `mock-servers/<source>.server.ts` previews shown in the review
 * step of the wizard. Extracted from `use-mock-generator.ts` so the hook only
 * deals with React state and side effects, while pure file synthesis lives
 * here and can be unit-tested in isolation.
 */

import type { GeneratedFile, MockGeneratorOptions, MockGeneratorState } from "./types";

/**
 * Generate the list of files that will be written when the user clicks
 * "Write to Disk". Currently produces one server entry per selected source.
 */
export function generateMockFiles(state: MockGeneratorState): GeneratedFile[] {
  const { options, selectedSources, sourceFilePaths } = state;
  const dir = options.outputDir;

  return selectedSources.map((source) => ({
    path: `${dir}/${source}.server.ts`,
    content: buildServerFile(source, options, dir, sourceFilePaths),
  }));
}

function buildServerFile(
  source: string,
  options: MockGeneratorOptions,
  mockDir: string,
  sourceFilePaths: Record<string, string>,
): string {
  const importPath = resolveRelativeImport(mockDir, sourceFilePaths[source] ?? `src/api/${source}`);

  return `import { defineMockServer } from "@noverax/nexus-mock";
import { ${source} } from "${importPath}";

export const mockServer = defineMockServer({
  source: ${source},
  port: ${options.port},
  seed: { count: ${options.seedCount} },
});
`;
}

/**
 * Compute relative import path from mock directory to source file.
 *
 * @example
 *   resolveRelativeImport("src/mocks/jsonPlaceholder", "src/api/jsonPlaceholder/index.ts")
 *   // → "../api/jsonPlaceholder"
 */
function resolveRelativeImport(fromDir: string, toFilePath: string): string {
  // Strip file extension and /index suffix
  const toDir = toFilePath
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/index$/, "");

  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = toDir.split("/").filter(Boolean);

  // Find common prefix length
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  const ups = fromParts.length - common;
  const remainder = toParts.slice(common);

  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return prefix + remainder.join("/");
}
