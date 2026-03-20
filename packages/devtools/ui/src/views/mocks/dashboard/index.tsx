import { Server } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { useActiveServer, useServerCount } from "@/store/mock-slice";
import { MockGeneratorWizard, useMockGenerator } from "../wizard";
import { DashboardGrid } from "./dashboard-grid";

export function MockDashboardView(): React.ReactElement {
  const serverCount = useServerCount();
  const activeServer = useActiveServer();
  const wizard = useMockGenerator();

  if (serverCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={Server}
          heading="No mock servers connected"
          description="Generate a mock server from your API definition or start an existing one to see it here."
          action={{
            label: "Generate Mock Server",
            onClick: wizard.openWizard,
          }}
        />
        <MockGeneratorWizard wizard={wizard} />
      </div>
    );
  }

  if (!activeServer) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">Select a server</div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <DashboardGrid server={activeServer} />
      <MockGeneratorWizard wizard={wizard} />
    </div>
  );
}
