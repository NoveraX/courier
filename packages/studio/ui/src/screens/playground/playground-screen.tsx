import { useStudioStore } from "@/store";
import { PlaygroundOffline } from "./playground-offline";
import { PlaygroundWorkspace } from "./playground-workspace";
import { usePlaygroundModel } from "./use-playground-model";

/**
 * The Playground: send a call to any endpoint the project defines — or
 * subscribe to a stream — through an attached app's runtime, and read the
 * answer as the inspector shows it. It says so when no app is attached or
 * no endpoint is known.
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
  if (!connected || !attached) return <PlaygroundOffline reason="no-app" />;
  if (!endpoint) return <PlaygroundOffline reason="no-endpoints" />;
  return <PlaygroundWorkspace choices={choices} endpoint={endpoint} onChoose={choose} />;
}
