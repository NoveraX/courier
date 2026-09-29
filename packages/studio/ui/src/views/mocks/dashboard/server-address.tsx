import { CopyButton } from "@/components/shared/copy-button";

import type { MockServerInfo } from "@/store/mock-slice";

/**
 * Where a mock server listens, with a button to copy it. Only a running
 * mock listens: the port of one that is not may belong to another process,
 * as when the mock crashed because that process holds it.
 *
 * @param props - The mock server
 * @returns Its address, or that it is not listening
 *
 * @example
 * ```tsx
 * <ServerAddress server={server} />
 * ```
 */
export function ServerAddress({ server }: { server: MockServerInfo }): React.ReactElement {
  const url =
    server.processStatus === "running" ? server.url || `http://localhost:${server.port}` : null;
  return (
    <div className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
      {url ? (
        <>
          <span className="font-mono text-[11px] text-muted-foreground/70">{url}</span>
          <CopyButton value={url} label="Copy URL" />
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground/70">Not listening</span>
      )}
    </div>
  );
}
