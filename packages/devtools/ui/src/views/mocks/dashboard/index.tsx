import { Server } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerCount } from "@/store/mock-slice";
import { MockGeneratorWizard, useMockGenerator } from "../wizard";

export function MockDashboardView(): React.ReactElement {
  const serverCount = useServerCount();
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

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <h2 className="text-h2">Mock Dashboard</h2>
      <p className="text-body-sm text-muted-foreground">
        {serverCount} server{serverCount > 1 ? "s" : ""} connected.
      </p>
      <MockGeneratorWizard wizard={wizard} />
    </div>
  );
}
