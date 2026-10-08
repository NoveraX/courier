import { useEffect, useState } from "react";

import { post } from "@/lib/api-client";
import type { SessionEnvironment } from "./session-environment";
import { environmentOf } from "./session-environment";

/** This Studio's environment, as far as it is known. */
export type CurrentEnvironment =
  | { kind: "reading" }
  | { kind: "known"; environment: SessionEnvironment }
  | { kind: "unknown"; message: string };

/**
 * The environment this Studio runs in — its version, Node.js, the packages
 * installed and each source's definition fingerprint — read once while it
 * is wanted, to set beside the one a session file was recorded in.
 *
 * @param wanted - Whether anything is compared with it
 * @returns Where reading it stands
 * @example
 * ```ts
 * const mine = useCurrentEnvironment(session?.environment !== undefined);
 * ```
 */
export function useCurrentEnvironment(wanted: boolean): CurrentEnvironment {
  const [state, setState] = useState<CurrentEnvironment>({ kind: "reading" });
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    async function read(): Promise<void> {
      try {
        const environment = environmentOf(await post<unknown>("/api/sessions/environment"));
        if (!current) return;
        setState(
          environment
            ? { kind: "known", environment }
            : { kind: "unknown", message: "Studio did not say its environment" },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (current) setState({ kind: "unknown", message });
      }
    }
    void read();
    return () => {
      current = false;
    };
  }, [wanted]);
  return state;
}
