import { Zap } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { useActiveServer } from "@/store/mock-slice";
import { NetworkPanel } from "./network-panel";
import type { PanelMode } from "./network-toolbar";
import { NetworkToolbar } from "./network-toolbar";

export function MockNetworkView(): React.ReactElement {
  const server = useActiveServer();
  const [panelMode, setPanelMode] = useState<PanelMode>("global");

  if (!server) {
    return (
      <PageShell center>
        <EmptyState
          icon={Zap}
          heading="No server selected"
          description="Select a mock server to configure network simulation."
        />
      </PageShell>
    );
  }

  const isRunning = server.processStatus === "running";

  return (
    <PageShell
      toolbar={
        <NetworkToolbar server={server} panelMode={panelMode} onPanelModeChange={setPanelMode} />
      }
    >
      <div className={isRunning ? undefined : "pointer-events-none opacity-40"}>
        <NetworkPanel server={server} panelMode={panelMode} />
      </div>
    </PageShell>
  );
}
