import { useEffect } from "react";

import { requestMockStore } from "@/mocks/request-mock-store";
import { useStudioStore } from "@/store";
import type { MockServerInfo } from "@/store/mock-slice";

/* While the page still waits for a mock's records, it asks again this often. */
const ASK_AGAIN_MS = 3_000;

/**
 * A mock's records, asked for while a view shows them — or is about to:
 * the Mocks section asks for the mock it opens on, so its Store tab shows
 * the records at once. The page asks while it is connected to Studio, again
 * while it waits, and again for a mock started anew, whose store is another.
 *
 * @param server - The mock shown, when there is one
 * @returns Whether the page is still waiting for the mock's records
 * @example
 * ```tsx
 * const waiting = useMockRecords(server);
 * if (waiting) return <MocksSkeleton view="records" />;
 * ```
 */
export function useMockRecords(server: MockServerInfo | undefined): boolean {
  const connected = useStudioStore((s) => s.connected);
  const serverId = server?.serverId;
  const waiting = server?.recordsLoaded === false;
  useEffect(() => {
    if (serverId === undefined || !waiting || !connected) return undefined;
    requestMockStore(serverId);
    const again = setInterval(() => requestMockStore(serverId), ASK_AGAIN_MS);
    return () => clearInterval(again);
  }, [serverId, waiting, connected]);
  return waiting;
}
