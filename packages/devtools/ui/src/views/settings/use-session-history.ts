import { useState, useEffect, useCallback } from "react";
import { createFetch } from "@noverax/nexus/fetch";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionSummary {
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

// ── API helpers ────────────────────────────────────────────────────────────

const client = createFetch();

async function fetchHistory(): Promise<SessionSummary[]> {
  try {
    return await client.post<SessionSummary[]>("/api/sessions/list", { json: {} });
  } catch {
    return [];
  }
}

async function deleteSessionApi(id: string): Promise<boolean> {
  try {
    await client.post("/api/sessions/delete", { json: { id } });
    return true;
  } catch {
    return false;
  }
}

async function saveSessionApi(
  requests: unknown[],
  apps: unknown[],
  name?: string,
): Promise<{ id: string; name: string } | null> {
  try {
    return await client.post<{ id: string; name: string }>("/api/sessions/save", {
      json: { requests, apps, name },
    });
  } catch {
    return null;
  }
}

async function exportSession(id: string, format: string): Promise<void> {
  let blob: Blob;
  try {
    blob = await client.post<Blob>("/api/sessions/export", {
      json: { id, format },
      responseType: "blob",
    });
  } catch {
    return;
  }

  const ext = format === "postman" ? "postman_collection.json" : format === "har" ? "har" : "json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session-${id}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchHistory();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      const ok = await deleteSessionApi(id);
      if (ok) setSessions((prev) => prev.filter((s) => s.id !== id));
      return ok;
    },
    [],
  );

  const save = useCallback(
    async (requests: unknown[], apps: unknown[], name?: string) => {
      const result = await saveSessionApi(requests, apps, name);
      if (result) await refresh();
      return result;
    },
    [refresh],
  );

  return { sessions, loading, refresh, remove, save, exportSession };
}
