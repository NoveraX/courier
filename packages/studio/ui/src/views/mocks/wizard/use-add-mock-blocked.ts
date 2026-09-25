import { useStudioStore } from "@/store";
import { sourceAvailability } from "./source-availability";

/**
 * Why a mock cannot be added now — Studio is not connected, still loading
 * `courier.config`, or the config does not load or is missing — for the
 * buttons that open the mock wizard to turn off and show.
 *
 * @returns The reason, or `null` when a mock can be added
 *
 * @example
 * ```tsx
 * const blocked = useAddMockBlocked();
 * <Button disabled={blocked !== null} title={blocked ?? undefined} onClick={openMockWizard}>Add mock server</Button>
 * ```
 */
export function useAddMockBlocked(): string | null {
  const connected = useStudioStore((s) => s.connected);
  const status = useStudioStore((s) => s.configStatus);
  const sourceCount = useStudioStore((s) => s.scanSources.length);
  return sourceAvailability({ connected, status, sourceCount }).blocked;
}
