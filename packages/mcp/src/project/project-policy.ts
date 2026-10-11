import { createLogger } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";

import {
  type CheckedPolicy,
  checkedPolicy,
  type Narrowing,
  narrowedPolicy,
} from "../policy/checked-policy";

const log = createLogger("MCP");

/**
 * The project's `agents` policy as its config stands, narrowed where the
 * server started — checked again only when the process reloads its config
 * and the reload brings a new one, as a dev server does on an edit. A
 * policy that will not check stops the server at its start; one a later
 * edit breaks is logged, and the last good one stays in force.
 *
 * @param config - The config as it stands after the last reload
 * @param narrowing - What the start narrows it by: `--read-only`, `--deny`
 * @returns The policy in force, read when the tools are built
 * @throws ConfigurationError `AGENT_POLICY_INVALID` from the first read, for a policy it cannot decide by
 * @example
 * ```ts
 * const policy = projectPolicy(() => runtime.config(), { readOnly: true });
 * policy().access; // "read"
 * ```
 */
export function projectPolicy(
  config: () => CourierConfig | undefined,
  narrowing: Narrowing,
): () => CheckedPolicy {
  let last: { written: unknown; policy: CheckedPolicy } | undefined;
  return () => {
    const written = config()?.agents;
    if (last !== undefined && last.written === written) return last.policy;
    try {
      last = { written, policy: narrowedPolicy(checkedPolicy(written), narrowing) };
    } catch (error) {
      if (last === undefined) throw error;
      log.error("courier.config's agents policy no longer checks; the last good one stays", error);
      last = { written, policy: last.policy };
    }
    return last.policy;
  };
}
