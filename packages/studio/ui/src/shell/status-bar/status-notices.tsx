import { configNotice } from "@/features/config/config-notice";
import { useStudioStore } from "@/store";
import type { BindingErrorPayload } from "@/store/types";

/** Something Studio needs said everywhere, while it holds. */
interface Notice {
  key: string;
  /** The status bar's few words. */
  label: string;
  /** The whole of it: the bar's title, and what the drawer, read by touch, shows. */
  detail: string;
  tone: string;
  /** Said aloud as it appears in the bar. */
  live?: boolean;
  /** The label is all there is to it: the bar gives it no title. */
  untitled?: boolean;
}

function droppedNotice(dropped: number): Notice | null {
  if (dropped <= 0) return null;
  const detail = `${dropped} older requests dropped — raise the limit in Settings`;
  return { key: "dropped", label: `${dropped} dropped`, detail, tone: "text-warn" };
}

function conflictNotice(error: BindingErrorPayload | null): Notice | null {
  if (!error) return null;
  const { sourceName, transport, runtimeIds } = error.details;
  const detail = `Binding conflict on ${sourceName} (${transport}) — claimed by ${runtimeIds.join(", ")}. Stop all but one runtime to resolve.`;
  return { key: "conflict", label: "binding conflict", detail, tone: "text-err", live: true };
}

function recordingNotice(session: string | undefined, paused: boolean): Notice | null {
  if (session !== undefined) {
    const label = `session ${session}`;
    return { key: "session", label, detail: label, tone: "truncate text-warn", untitled: true };
  }
  if (!paused) return null;
  const tone = "font-semibold text-warn";
  return { key: "paused", label: "REC PAUSED", detail: "REC PAUSED", tone, untitled: true };
}

function useNotices(): Notice[] {
  const dropped = droppedNotice(useStudioStore((s) => s.droppedRequests));
  const conflict = conflictNotice(useStudioStore((s) => s.lastBindingError));
  const config = configNotice(useStudioStore((s) => s.configStatus));
  const recording = recordingNotice(
    useStudioStore((s) => s.shownSession?.name),
    useStudioStore((s) => s.paused),
  );
  const loads: Notice | null = config && {
    key: "config",
    label: config.label,
    detail: config.title,
    tone: config.failed ? "text-err" : "text-warn",
    live: true,
  };
  return [dropped, conflict, loads, recording].filter((notice) => notice !== null);
}

/**
 * What Studio needs said everywhere, after the counts: the requests dropped
 * past the limit, a binding conflict, a config it cannot run, a saved
 * session shown, recording paused — each only while it holds. The status
 * bar gives each a few words with the whole in a title, and says the faults
 * aloud as they appear; the navigation drawer, read on a touch screen where
 * no title shows, gives the whole of each.
 *
 * @param props - Where the notices sit
 * @returns The notices, in order
 * @example
 * ```tsx
 * <StatusNotices place="bar" />
 * ```
 */
export function StatusNotices({ place }: { place: "bar" | "drawer" }): React.ReactNode {
  const notices = useNotices();
  if (place === "drawer") {
    return notices.map((notice) => (
      <p key={notice.key} className={notice.tone}>
        {notice.detail}
      </p>
    ));
  }
  return notices.map((notice) =>
    notice.live ? (
      <span
        key={notice.key}
        role="status"
        aria-live="polite"
        title={notice.detail}
        aria-label={notice.detail}
        className={notice.tone}
      >
        {notice.label}
      </span>
    ) : (
      <span
        key={notice.key}
        title={notice.untitled ? undefined : notice.detail}
        className={notice.tone}
      >
        {notice.label}
      </span>
    ),
  );
}
