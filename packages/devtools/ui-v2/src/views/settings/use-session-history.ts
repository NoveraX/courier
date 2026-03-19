import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

import type { ExportFormat } from "@/store/types";

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
      const res = await fetch("/api/sessions/list", { method: "POST" });
      const data = (await res.json()) as { sessions: SessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function saveCurrentSession(name: string): Promise<void> {
    const res = await fetch("/api/sessions/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to save session");
    toast.success("Session saved");
    await fetchSessions();
  }

  async function loadSession(id: string): Promise<void> {
    const res = await fetch("/api/sessions/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Failed to load session");
    toast.success("Session loaded");
  }

  async function deleteSession(id: string): Promise<void> {
    const res = await fetch("/api/sessions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Failed to delete session");
    toast.success("Session deleted");
    await fetchSessions();
  }

  async function exportSession(
    id: string,
    format: ExportFormat,
  ): Promise<void> {
    const res = await fetch("/api/sessions/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, format }),
    });
    if (!res.ok) throw new Error("Failed to export session");

    const blob = await res.blob();
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
      await fetch("/api/sessions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id }),
      });
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
