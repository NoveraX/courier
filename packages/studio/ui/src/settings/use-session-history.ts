import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import type { SessionSummary } from "@/features/settings/session-summary";
import { sessionSummariesOf } from "@/features/settings/session-summary";
import { apiClient, post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { isRecord } from "@/store/event-helpers";
import type { ExportFormat, RequestEntry } from "@/store/types";

// ── Session history hook ─────────────────────────────────────────────────────

/** The sessions Studio keeps, and what can be done with them. */
interface SessionHistory {
  sessions: SessionSummary[];
  loading: boolean;
  /** Save the requests on screen; resolves to whether Studio kept them */
  saveCurrentSession: (name: string) => Promise<boolean>;
  loadSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  exportSession: (id: string, format: ExportFormat) => Promise<void>;
  deleteAllSessions: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * The sessions Studio keeps in `.courier/sessions/`, and what can be done
 * with them: save the requests on screen as one, load one back into the
 * Timeline, export, delete. A step that fails says why in a toast.
 *
 * @returns The saved sessions, whether they are still loading, and the actions
 *
 * @example
 * ```tsx
 * const history = useSessionHistory();
 * const saved = await history.saveCurrentSession("Debugging auth");
 * ```
 */
export function useSessionHistory(): SessionHistory {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setSessions(sessionSummariesOf(await post<unknown>("/api/sessions/list")));
    } catch (error) {
      failed("list the saved sessions", error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  /* Studio keeps no requests of its own: the session saved is the one this page recorded. */
  async function saveCurrentSession(name: string): Promise<boolean> {
    const requests = useStudioStore.getState().requests.map(savedRequestOf);
    if (
      !(await attempt("save the session", () => post("/api/sessions/save", { name, requests })))
    ) {
      return false;
    }
    toast.success("Session saved");
    await fetchSessions();
    return true;
  }

  async function loadSession(id: string): Promise<void> {
    const session = await attempt("load the session", () =>
      post<unknown>("/api/sessions/load", { id }),
    );
    if (!isRecord(session) || !Array.isArray(session.requests)) return;
    const requests = session.requests
      .map(requestFromSaved)
      .filter((r): r is RequestEntry => r !== undefined);
    /* Recording pauses, so live traffic does not mix into the session shown;
       Studio keeps it shown, across a reload, until the page goes back to live. */
    useStudioStore.getState().showSession({ id, name: String(session.name) }, requests);
    toast.success(
      `Loaded ${requests.length} requests from "${String(session.name)}"; recording paused`,
    );
  }

  async function deleteSession(id: string): Promise<void> {
    if (!(await attempt("delete the session", () => post("/api/sessions/delete", { id })))) return;
    toast.success("Session deleted");
    await fetchSessions();
  }

  async function exportSession(id: string, format: ExportFormat): Promise<void> {
    const blob = await attempt("export the session", () =>
      apiClient.post<Blob>("/api/sessions/export", { json: { id, format }, responseType: "blob" }),
    );
    if (!blob) return;
    const { downloadFile } = await import("@/lib/export");
    downloadFile(blob, `session-${id}.${format === "har" ? "har" : "json"}`);
    toast.success(`Exported as ${format.toUpperCase()}`);
  }

  async function deleteAllSessions(): Promise<void> {
    for (const session of sessions) {
      const deleted = await attempt("delete the sessions", () =>
        post("/api/sessions/delete", { id: session.id }),
      );
      if (!deleted) return fetchSessions();
    }
    toast.success("All sessions deleted");
    await fetchSessions();
  }

  return {
    sessions,
    loading,
    saveCurrentSession,
    loadSession,
    deleteSession,
    exportSession,
    deleteAllSessions,
    refresh: fetchSessions,
  };
}

/** Run one step against Studio; a failure is told in a toast and yields `undefined`. */
async function attempt<TResult>(
  what: string,
  step: () => Promise<TResult>,
): Promise<TResult | undefined> {
  try {
    return await step();
  } catch (error) {
    failed(what, error);
    return undefined;
  }
}

function failed(what: string, error: unknown): void {
  toast.error(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
}
