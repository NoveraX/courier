import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { ExportFormat } from "@/store/types";
import { apiClient, post } from "@/lib/api-client";

// ── Session summary (matches server SessionSummary) ──────────────────────────

interface SessionSummary {
  id: string;
  name: string;
  savedAt: number;
  startedAt: number;
  duration: number;
  stats: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgDuration: number;
    totalSize: number;
  };
  appCount: number;
}

// ── Session history hook ─────────────────────────────────────────────────────

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await post<{ sessions: SessionSummary[] }>("/api/sessions/list");
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function saveCurrentSession(name: string): Promise<void> {
    await post("/api/sessions/save", { name });
    toast.success("Session saved");
    await fetchSessions();
  }

  async function loadSession(id: string): Promise<void> {
    await post("/api/sessions/load", { id });
    toast.success("Session loaded");
  }

  async function deleteSession(id: string): Promise<void> {
    await post("/api/sessions/delete", { id });
    toast.success("Session deleted");
    await fetchSessions();
  }

  async function exportSession(id: string, format: ExportFormat): Promise<void> {
    // Export needs raw blob response — use apiClient directly
    const blob = await apiClient.post<Blob>("/api/sessions/export", {
      json: { id, format },
      responseType: "blob",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${id}.${format === "har" ? "har" : "json"}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format.toUpperCase()}`);
  }

  async function deleteAllSessions(): Promise<void> {
    for (const session of sessions) {
      await post("/api/sessions/delete", { id: session.id });
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
