import type { MappedEndpoint, PrefixMapping } from "../prefix-route-types";

/**
 * The endpoint a group and a name point at in a source's mappings.
 *
 * A source that declares its endpoints without groups is addressed with no
 * group; its endpoint is then found by name when exactly one group offers
 * it, as the registry finds its mock — two would be a guess.
 *
 * @param mappings - The source's groups and endpoints
 * @param group - The group, empty for none
 * @param method - The endpoint's name
 * @returns The endpoint, or `undefined`
 * @example
 * ```ts
 * findMappedEndpoint(mappings, "chat", "room")?.channel?.topicKey;
 * ```
 */
export function findMappedEndpoint(
  mappings: readonly PrefixMapping[],
  group: string,
  method: string,
): MappedEndpoint | undefined {
  if (group !== "") {
    return mappings
      .find((mapping) => mapping.group === group)
      ?.endpoints?.find((ep) => ep.name === method);
  }
  const offering = mappings
    .flatMap((mapping) => mapping.endpoints ?? [])
    .filter((ep) => ep.name === method);
  return offering.length === 1 ? offering[0] : undefined;
}
