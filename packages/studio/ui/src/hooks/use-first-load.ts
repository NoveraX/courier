import { type FirstLoad, firstLoad } from "@/features/loading/first-load";
import { useStudioStore } from "@/store";

/**
 * What the page still waits for from Studio before it has anything to show,
 * for its skeleton.
 *
 * @returns Whether the requests and the sources are still on their way
 * @example
 * ```tsx
 * const loading = useFirstLoad();
 * if (loading.requests) return <TimelineSkeleton />;
 * ```
 */
export function useFirstLoad(): FirstLoad {
  const status = useStudioStore((s) => s.connectionStatus);
  const config = useStudioStore((s) => s.configStatus);
  const sourceCount = useStudioStore((s) => s.scanSources.length);
  return firstLoad({ status, config, sourceCount });
}
