import { attachedApps } from "@/features/runtimes/attached-apps";
import { useStudioStore } from "@/store";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The connect step's state: waiting for an app to attach, the app attached
 * with the sources it binds, or Studio out of reach.
 *
 * @returns The state's box
 * @example
 * ```tsx
 * <ConnectState />
 * ```
 */
export function ConnectState(): React.ReactNode {
  const status = useStudioStore((s) => s.connectionStatus);
  const attempt = useStudioStore((s) => s.reconnectAttempt);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const [app] = attachedApps(snapshot);
  if (status === "disconnected" || status === "reconnecting") {
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-err/30 bg-err-dim px-3 py-2.5">
        <span aria-hidden="true" className="size-1.75 rounded-full bg-err" />
        <span className="font-strong">Studio cannot be reached</span>
        <span className="font-mono text-label text-fg-muted">
          {status === "reconnecting" ? `reconnecting · attempt ${attempt}` : "disconnected"}
        </span>
      </div>
    );
  }
  if (app) {
    return (
      <div className="flex animate-pop-in flex-wrap items-center gap-2.5 rounded-card border border-ok/30 bg-ok-dim px-3 py-2.5">
        <span aria-hidden="true" className="size-1.75 rounded-full bg-ok" />
        <span className="font-strong">{app.id} attached</span>
        <span className="font-mono text-label text-fg-muted">
          {app.kind} · {plural(snapshot.sourceCount, "source")} bound
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-8 w-max max-w-full items-center gap-2.25 rounded-control border border-line bg-inset px-3 font-mono text-small text-fg-muted">
      <span aria-hidden="true" className="size-1.5 animate-pulse-live rounded-full bg-brand" />
      listening on ws://{window.location.host}/runtime
    </div>
  );
}
