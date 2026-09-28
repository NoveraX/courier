import type { FaultWeight, NetworkConfig } from "../types";

/* A timeout fault holds its request until it times out, so an error rate
   alone never picks one: it fails requests, it does not stall them. */
const DEFAULT_FAULT_TYPES = ["500", "503"] as const;

/** Decide if this request should fail based on error rate */
export function shouldFail(config: NetworkConfig): boolean {
  if (!config.errorRate || config.errorRate <= 0) return false;
  return Math.random() < config.errorRate;
}

/** Pick a fault type — uses weighted distribution when faultWeights is set */
export function pickFault(config: NetworkConfig): string {
  if (config.faultWeights?.length) {
    return pickWeightedFault(config.faultWeights);
  }
  const faults = config.faultTypes ?? [...DEFAULT_FAULT_TYPES];
  return faults[Math.floor(Math.random() * faults.length)] ?? "500";
}

/** Weighted random selection — weights don't need to sum to 100 */
function pickWeightedFault(weights: FaultWeight[]): string {
  const active = weights.filter((w) => w.weight > 0);
  if (active.length === 0) return "500";

  const totalWeight = active.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of active) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  const last = active[active.length - 1];
  return last ? last.type : "500";
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
