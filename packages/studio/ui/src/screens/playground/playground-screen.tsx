import { useFirstLoad } from "@/hooks/use-first-load";
import { useStudioStore } from "@/store";
import { PlaygroundOffline } from "./playground-offline";
import { PlaygroundSkeleton } from "./playground-skeleton";
import { PlaygroundWorkspace } from "./playground-workspace";
import { usePlaygroundModel } from "./use-playground-model";

/**
 * The Playground: send a call to any endpoint the project defines — or
 * subscribe to a stream — through an attached app's runtime, and read the
 * answer as the inspector shows it. Until Studio has said which app is
 * attached and which endpoints it serves, it shows its panes loading; then
 * it says so when no app is attached or no endpoint is known.
 *
 * @returns The screen
 * @example
 * ```tsx
 * <PlaygroundScreen />
 * ```
 */
export function PlaygroundScreen(): React.ReactNode {
  const connected = useStudioStore((s) => s.connected);
  const attached = useStudioStore((s) => s.bindingSnapshot.runtimeCount > 0);
  const { choices, endpoint, choose } = usePlaygroundModel();
  const loading = useFirstLoad();
  /* An app may attach before Studio has loaded the config that names its endpoints. */
  if (loading.requests || (attached && !endpoint && loading.sources)) return <PlaygroundSkeleton />;
  if (!connected || !attached) return <PlaygroundOffline reason="no-app" />;
  if (!endpoint) return <PlaygroundOffline reason="no-endpoints" />;
  return <PlaygroundWorkspace choices={choices} endpoint={endpoint} onChoose={choose} />;
}
