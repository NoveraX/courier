import type { ScanResult } from "./types";
import { API_BASE } from "./api";

export async function fetchScanProject(): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/api/apis/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Scan failed");
  return data as ScanResult;
}
