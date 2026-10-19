import { Play } from "lucide-react";

/**
 * What the Playground says when it cannot send: no app is attached to run
 * the calls, or no source declares an endpoint yet — in the middle of the
 * view, which it fills.
 *
 * @param props - Which of the two it is
 * @returns The notice
 * @example
 * ```tsx
 * <PlaygroundOffline reason="no-app" />
 * ```
 */
export function PlaygroundOffline({
  reason,
}: {
  reason: "no-app" | "no-endpoints";
}): React.ReactNode {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-dialog border border-line-strong bg-panel text-fg-subtle">
        <Play aria-hidden="true" className="size-4.5" />
      </span>
      <p className="text-title font-semibold">
        {reason === "no-app" ? "No app attached" : "No endpoints to send to"}
      </p>
      <p className="max-w-95 text-small text-fg-subtle">
        {reason === "no-app"
          ? "The Playground runs each call on your app's runtime. Start your app with Courier Studio enabled, and it attaches."
          : "Declare a source in your courier config, or start an app that serves one, and its endpoints show up here."}
      </p>
    </div>
  );
}
