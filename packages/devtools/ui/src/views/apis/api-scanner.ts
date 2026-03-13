import { client, rethrowMessage } from "./client";
import type { ScanResult } from "./types";

export async function fetchScanProject(): Promise<ScanResult> {
  return client.post<ScanResult>("/api/apis/scan", { json: {} })
    .catch(rethrowMessage("Scan failed"));
}
