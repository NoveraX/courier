import { ChevronsUpDown, Play, RotateCw, Square } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { POP_MOTION } from "@/design/overlay-motion";
import { cn } from "@/lib/utils";
import { manageMock } from "@/mocks/manage-mock";
import type { MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { PROCESS_STATUS } from "./process-status";

const BUTTON =
  "flex h-full w-8 shrink-0 cursor-pointer items-center justify-center border-l border-line hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-40 pointer-coarse:w-10";

/**
 * The mock server in use: its state, name and port — a menu of the others
 * when there are several — and, for one Studio runs, Restart and Stop or
 * Start.
 *
 * @param props - The server shown, and every server
 * @returns The pill
 * @example
 * ```tsx
 * <ServerPill server={server} servers={servers} />
 * ```
 */
export function ServerPill({
  server,
  servers,
}: {
  server: MockServerInfo;
  servers: readonly MockServerInfo[];
}): React.ReactNode {
  const status = PROCESS_STATUS[server.processStatus];
  const running = server.processStatus === "running";
  const busy = status.changing;
  const name = (
    <span className="flex h-full min-w-0 items-center gap-2 border-r border-line px-2.75">
      <span className="truncate font-mono text-small font-medium">{server.name}</span>
      <span className="font-mono text-badge text-fg-subtle max-md:hidden">:{server.port}</span>
      {servers.length > 1 && (
        <ChevronsUpDown aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
      )}
    </span>
  );
  return (
    <div className="flex h-8 max-w-full min-w-0 items-center overflow-hidden rounded-card border border-line bg-panel pointer-coarse:h-10">
      {servers.length > 1 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`Mock server: ${server.name}`}
            className="flex h-full min-w-0 cursor-pointer hover:bg-raised"
          >
            {name}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              collisionPadding={8}
              className={cn(
                "z-50 max-w-[calc(100vw-16px)] min-w-52 rounded-panel bg-panel p-1 shadow-overlay",
                POP_MOTION,
              )}
            >
              <DropdownMenu.RadioGroup
                value={server.serverId}
                onValueChange={(id) => useMockStore.getState().selectServer(id)}
              >
                {servers.map((s) => (
                  <DropdownMenu.RadioItem
                    key={s.serverId}
                    value={s.serverId}
                    className="flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 font-mono text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg data-[state=checked]:text-fg pointer-coarse:h-10"
                  >
                    <span className="flex-1">{s.name}</span>
                    <span className="text-badge text-fg-subtle">:{s.port}</span>
                    <span className={cn("text-badge", PROCESS_STATUS[s.processStatus].className)}>
                      {PROCESS_STATUS[s.processStatus].label.toLowerCase()}
                    </span>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        name
      )}
      <span
        title={server.lastError}
        className={cn("px-2.5 text-label font-strong whitespace-nowrap", status.className)}
      >
        {status.label}
      </span>
      {server.managed && (
        <>
          <button
            type="button"
            title="Restart"
            aria-label="Restart the mock server"
            disabled={busy}
            onClick={() => manageMock(server.serverId, "restart")}
            className={cn(BUTTON, "text-fg-muted hover:text-fg")}
          >
            <RotateCw aria-hidden="true" className="size-3.25" />
          </button>
          <button
            type="button"
            title={running ? "Stop server" : "Start server"}
            aria-label={running ? "Stop the mock server" : "Start the mock server"}
            disabled={busy}
            onClick={() => manageMock(server.serverId, running ? "stop" : "start")}
            className={cn(BUTTON, running ? "text-err" : "text-ok")}
          >
            {running ? (
              <Square aria-hidden="true" className="size-3" />
            ) : (
              <Play aria-hidden="true" className="size-3" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
