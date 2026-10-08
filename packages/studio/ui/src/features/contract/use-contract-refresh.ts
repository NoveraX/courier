import { useEffect } from "react";

import { useStudioStore } from "@/store";
import { refreshContract } from "./contract-store";

/* Answers come in bursts: the report is asked again once a burst rests, at most this often. */
const REST_MS = 3000;

/**
 * Keep the contract report current while the Explorer shows: asked when it
 * opens, and again once new answers have come and rested a moment.
 *
 * @example
 * ```ts
 * useContractRefresh();
 * ```
 */
export function useContractRefresh(): void {
  const answers = useStudioStore((s) => s.requests.length);
  useEffect(() => {
    void refreshContract();
  }, []);
  useEffect(() => {
    if (answers === 0) return;
    const timer = setTimeout(() => void refreshContract(), REST_MS);
    return () => clearTimeout(timer);
  }, [answers]);
}
