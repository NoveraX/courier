import { useEffect, useState } from "react";

import { type CallSites, findCallSites, knownCallSites } from "./call-sites";

/**
 * Where the project's code calls an endpoint: found when asked for, and
 * again for another endpoint or once ten seconds have passed.
 *
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client
 * @returns The call sites, or how far finding them got
 * @example
 * ```ts
 * const sites = useCallSites(request.source, endpointId);
 * ```
 */
export function useCallSites(source: string, endpoint: string): CallSites {
  const [found, setFound] = useState<CallSites>(
    () => knownCallSites(source, endpoint) ?? { status: "loading" },
  );
  useEffect(() => {
    const cached = knownCallSites(source, endpoint);
    if (cached) {
      setFound(cached);
      return;
    }
    let current = true;
    setFound({ status: "loading" });
    void findCallSites(source, endpoint).then((next) => {
      if (current) setFound(next);
    });
    return () => {
      current = false;
    };
  }, [source, endpoint]);
  return found;
}
