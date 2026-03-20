import type { NetworkConfig } from "../types";

const DEFAULT_FAULT_TYPES = ["500", "503", "timeout"] as const;

/** Decide if this request should fail based on error rate */
export function shouldFail(config: NetworkConfig): boolean {
  if (!config.errorRate || config.errorRate <= 0) return false;
  return Math.random() < config.errorRate;
}

/** Pick a random fault type from the configured list */
export function pickFault(config: NetworkConfig): string {
  const faults = config.faultTypes ?? [...DEFAULT_FAULT_TYPES];
  return faults[Math.floor(Math.random() * faults.length)] ?? "500";
}

/** Create an error for a given fault type */
export function createFaultError(fault: string): { status: number; message: string } {
  switch (fault) {
    case "timeout":
      return { status: 408, message: "Request Timeout (simulated)" };
    case "reset":
      return { status: 502, message: "Connection Reset (simulated)" };
    default:
      return { status: Number(fault) || 500, message: `HTTP ${fault} (simulated)` };
  }
}
