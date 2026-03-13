import { WifiOff } from "lucide-react";

import { useDevToolsStore } from "@/store";

export function DisconnectedBanner(): React.ReactNode {
  const connectionStatus = useDevToolsStore((s) => s.connectionStatus);
  const reconnectAttempt = useDevToolsStore((s) => s.reconnectAttempt);

  if (connectionStatus === "connected") return null;

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
