import { Server } from "lucide-react";

interface BrowsersOnlyNoticeProps {
  /** Runs the call as server code, in Direct mode; `undefined` while a call is under way. */
  onRunAsServer?: (() => void) | undefined;
}

/**
 * Why the app's `browsersOnly` refused a Proxy-mode run, and the ways past
 * it. The runtime sends every such run a one-time pass the proxy route
 * redeems only in the process the runtime is attached to, in development:
 * a refusal means the route runs elsewhere, on a core that redeems none, or
 * that the pass did not arrive whole and in time.
 *
 * @param props - What runs the call as server code
 * @returns The notice
 * @example
 * ```tsx
 * {refusedByBrowsersOnly(entry) && <BrowsersOnlyNotice onRunAsServer={run} />}
 * ```
 */
export function BrowsersOnlyNotice({ onRunAsServer }: BrowsersOnlyNoticeProps): React.ReactNode {
  return (
    <div role="note" className="flex flex-col gap-2 border-b border-line bg-warn-dim px-4.5 py-3">
      <p className="m-0 text-small font-semibold text-warn">browsersOnly refused this call</p>
      <p className="m-0 text-label leading-normal text-fg-muted">
        The proxy route did not redeem Studio's one-time pass. Only Studio's runtime in the process
        that serves the route can, in development: an Edge route, workerd, a remote appOrigin or an
        older Courier core never does. The pass also fails when a proxy in front of the route takes
        its header off, when the route is reached more than 30 seconds later, as while it compiles
        on first request, when more than 256 calls are in flight, or when it was already spent: send
        the call again.
      </p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-label leading-normal text-fg-muted">
        <li>Run the call in Direct mode, as your server code does.</li>
        <li>
          <code className="font-mono">browsersOnly: process.env.NODE_ENV === "production"</code>{" "}
          lets development answer every caller.
        </li>
        <li>Serve the proxy route on the Node runtime, in the process Studio is attached to.</li>
      </ul>
      <button
        type="button"
        disabled={onRunAsServer === undefined}
        onClick={onRunAsServer}
        className="flex h-7 cursor-pointer items-center gap-1.5 self-start rounded-[6px] border border-line-strong bg-panel px-2.5 text-small text-fg transition-colors hover:border-fg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
      >
        <Server aria-hidden="true" className="size-3" />
        Run in Direct mode
      </button>
    </div>
  );
}
