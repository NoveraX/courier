import { WifiOff } from "lucide-react";

import { useStudioStore } from "@/store";

export function DisconnectedBanner(): React.ReactNode {
  const connectionStatus = useStudioStore((s) => s.connectionStatus);
  const reconnectAttempt = useStudioStore((s) => s.reconnectAttempt);

  /* The page's first connection is not a lost one; it settles in a moment. */
  if (connectionStatus === "connected" || connectionStatus === "connecting") return null;

  const isReconnecting = connectionStatus === "reconnecting";

  return (
    <div className="flex items-center justify-center gap-2 bg-destructive/10 px-3 py-1.5 text-body-sm text-destructive-foreground">
      <WifiOff className="size-3.5 shrink-0" />
      <span>
        {isReconnecting
          ? `Reconnecting... (attempt ${reconnectAttempt})`
          : "Connection lost. Waiting for server..."}
      </span>
    </div>
  );
}
