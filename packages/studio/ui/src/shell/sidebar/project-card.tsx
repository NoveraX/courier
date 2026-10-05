import { ChevronsUpDown, Globe, Server } from "lucide-react";
import { Popover } from "radix-ui";

import { Dot } from "@/design/dot";
import type { AttachedApp } from "@/features/runtimes/attached-apps";
import { attachedApps } from "@/features/runtimes/attached-apps";
import { useStudioStore } from "@/store";
import type { ConnectionStatus } from "@/store/types-ui";

interface CardState {
  /** The apps attached, as Studio last told — none while it cannot say. */
  apps: AttachedApp[];
  summary: string;
  dot: "ok" | "muted" | "err";
}

/* What the card says: the connection first, since a Studio that cannot be
   reached cannot vouch for the apps it last listed. */
function cardState(apps: AttachedApp[], status: ConnectionStatus): CardState {
  if (status === "connecting") return { apps: [], summary: "connecting…", dot: "muted" };
  if (status !== "connected") return { apps: [], summary: "Studio unreachable", dot: "err" };
  const [first] = apps;
  if (!first) return { apps, summary: "no app attached", dot: "muted" };
  const more = apps.length > 1 ? ` +${apps.length - 1}` : "";
  return {
    apps,
    summary: `${first.id}${first.origin ? ` · ${first.origin}` : ""}${more}`,
    dot: "ok",
  };
}

function AppRow({ app }: { app: AttachedApp }): React.ReactNode {
  const Icon = app.kind === "browser" ? Globe : Server;
  return (
    <li className="flex items-center gap-2.5 rounded-control px-2 py-1.5">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-small text-fg">{app.id}</span>
        <span className="truncate font-mono text-micro text-fg-subtle">
          {app.kind} · {app.origin ?? "origin not reported"}
        </span>
      </span>
    </li>
  );
}

/**
 * The project Studio runs, by name, and the apps attached to it: the first
 * on the card, all of them in the list it opens — or, while Studio connects
 * or cannot be reached, that instead.
 *
 * @returns The card
 * @example
 * ```tsx
 * <ProjectCard />
 * ```
 */
export function ProjectCard(): React.ReactNode {
  const name = useStudioStore((s) => s.studioInfo?.project.name ?? "Project");
  const status = useStudioStore((s) => s.connectionStatus);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const { apps, summary, dot } = cardState(attachedApps(snapshot), status);
  return (
    <Popover.Root>
      <Popover.Trigger className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-card border border-line bg-panel px-2.5 text-left text-fg transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand">
        <span className="relative flex size-5.5 shrink-0 items-center justify-center rounded-md bg-raised text-badge font-semibold text-fg-muted">
          {name.slice(0, 1)}
          <Dot tone={dot} className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-panel" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-control leading-[1.2] font-strong">{name}</span>
          <span className="truncate font-mono text-micro leading-[1.2] text-fg-subtle">
            {summary}
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-(--radix-popover-trigger-width) min-w-56 animate-pop-in rounded-card border border-line bg-panel p-1 shadow-overlay"
        >
          <div className="px-2 pt-1.5 pb-1 text-label font-medium text-fg-subtle">
            Attached apps
          </div>
          {apps.length === 0 ? (
            <p className="px-2 pb-2 text-small text-fg-muted">
              {dot === "err"
                ? "Studio cannot be reached; the apps attached show here once it is back."
                : "Start your dev server with the Studio plugin, and it attaches here."}
            </p>
          ) : (
            <ul>
              {apps.map((app) => (
                <AppRow key={app.id} app={app} />
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
