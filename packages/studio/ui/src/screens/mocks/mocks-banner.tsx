import { CircleAlert, CirclePause, Flame, GitFork } from "lucide-react";

import type { MockBanner } from "@/features/mocks/mock-banner";
import { HAPPY_PATH } from "@/features/mocks/scenario-view";
import { cn } from "@/lib/utils";
import { stopAllFaults } from "@/mocks/stop-all-faults";
import { getSocket } from "@/socket";
import type { MockServerInfo } from "@/store/mock-slice";

const LOOK: Readonly<Record<MockBanner["tone"], { className: string; icon: string }>> = {
  err: { className: "bg-err-dim", icon: "text-err" },
  warn: { className: "bg-warn-dim", icon: "text-warn" },
  muted: { className: "bg-raised", icon: "text-fg-subtle" },
};

function iconOf(banner: MockBanner): React.ReactNode {
  const Icon =
    banner.action?.kind === "stop-chaos"
      ? Flame
      : banner.action?.kind === "reset-scenario"
        ? GitFork
        : banner.tone === "muted"
          ? CirclePause
          : CircleAlert;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", LOOK[banner.tone].icon)} />;
}

/**
 * The line under the Mocks bar that says what is not as written — the
 * mocks file, a stopped or crashed server, chaos, a scenario — with the
 * button that sets it right.
 *
 * @param props - The banner, and the server it is about
 * @returns The banner
 * @example
 * ```tsx
 * {banner && <MocksBanner banner={banner} server={server} />}
 * ```
 */
export function MocksBanner({
  banner,
  server,
}: {
  banner: MockBanner;
  server: MockServerInfo | undefined;
}): React.ReactNode {
  const act = () => {
    if (!server || !banner.action) return;
    if (banner.action.kind === "start")
      getSocket().emit("mock:managed", {
        command: "mock:managed:start",
        serverId: server.serverId,
      });
    else if (banner.action.kind === "stop-chaos") stopAllFaults(server.serverId);
    else
      getSocket().emit("mock:command", {
        action: "mock:scenario:apply",
        serverId: server.serverId,
        scenario: HAPPY_PATH,
      });
  };
  return (
    <div
      role={banner.tone === "err" ? "alert" : "status"}
      className={cn(
        "flex shrink-0 items-center gap-2.5 border-b border-line px-5 py-2.25 text-control",
        LOOK[banner.tone].className,
      )}
    >
      {iconOf(banner)}
      <span className="font-semibold">{banner.title}</span>
      <span className="min-w-0 truncate text-fg-muted" title={banner.detail}>
        {banner.detail}
      </span>
      <div className="flex-1" />
      {banner.action && server && (
        <button
          type="button"
          onClick={act}
          className="h-6.5 shrink-0 cursor-pointer rounded-[6px] border border-line-strong bg-panel px-2.5 text-small text-fg hover:bg-raised"
        >
          {banner.action.label}
        </button>
      )}
    </div>
  );
}
