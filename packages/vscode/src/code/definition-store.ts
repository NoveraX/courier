import type { EndpointDefinition } from "../studio/studio-types";
import { realPath } from "./real-path";

/** Where each Studio found the project's endpoints declared. */
export interface DefinitionStore {
  /** Every declaration a Studio found, asked again at most every half minute */
  definitionsFor(studio: string): Promise<readonly EndpointDefinition[]>;
  /** The declarations in one file */
  definitionsIn(studio: string, file: string): Promise<readonly EndpointDefinition[]>;
  /** Ask again at the next question: a file of the project was saved */
  forget(): void;
}

/* Declarations move only when a file is saved, which forgets them; this bounds a change made outside the editor. */
const FRESH_MS = 30_000;

/**
 * Where each Studio found the project's endpoints declared, asked once and
 * kept until a file is saved or half a minute passes. A Studio that does
 * not answer, or is older than the question, has found none.
 *
 * @param fetchDefinitions - What asks a Studio
 * @returns The store
 * @example
 * ```ts
 * const definitions = createDefinitionStore(fetchDefinitions);
 * await definitions.definitionsIn(studio, document.uri.fsPath);
 * ```
 */
export function createDefinitionStore(
  fetchDefinitions: (studio: string) => Promise<EndpointDefinition[]>,
): DefinitionStore {
  const asked = new Map<string, { at: number; definitions: Promise<EndpointDefinition[]> }>();
  const definitionsFor = (studio: string) => {
    const known = asked.get(studio);
    if (known && Date.now() - known.at < FRESH_MS) return known.definitions;
    const definitions = fetchDefinitions(studio).catch((): EndpointDefinition[] => []);
    asked.set(studio, { at: Date.now(), definitions });
    return definitions;
  };
  return {
    definitionsFor,
    async definitionsIn(studio, file) {
      const path = realPath(file);
      return (await definitionsFor(studio)).filter((definition) => definition.path === path);
    },
    forget: () => asked.clear(),
  };
}
