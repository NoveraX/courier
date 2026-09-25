import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveServer, useServerCount } from "@/store/mock-slice";
import { openMockWizard, useAddMockBlocked } from "../wizard";
import { DashboardGrid } from "./dashboard-grid";

export function MockDashboardView(): React.ReactElement {
  const serverCount = useServerCount();
  const activeServer = useActiveServer();
  const addBlocked = useAddMockBlocked();

  if (serverCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border-subtle bg-muted/30">
          <Server className="size-5 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-body-sm font-medium text-foreground/70">No mock servers yet</p>
          <p className="mt-1 text-body-xs text-muted-foreground/50">
            {addBlocked ?? "Add a mock server for one of your API sources to get started"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={addBlocked !== null} onClick={openMockWizard}>
          Add mock server
        </Button>
      </div>
    );
  }

  if (!activeServer) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">Select a server</div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <DashboardGrid server={activeServer} />
    </div>
  );
}
