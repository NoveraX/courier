import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { UseMockGeneratorReturn } from "./use-mock-generator";

interface ConfigureStepProps {
  wizard: UseMockGeneratorReturn;
}

export function ConfigureStep({ wizard }: ConfigureStepProps): React.ReactElement {
  const { options } = wizard.state;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3">Configure Mock Server</h3>
        <p className="text-body-sm text-muted-foreground">
          Set output path, port, and seed count. Scenarios (happy-path, empty, error, slow-network)
          are included automatically.
        </p>
      </div>

      {/* Output directory */}
      <FieldRow label="Output directory">
        <Input
          value={options.outputDir}
          onChange={(e) => wizard.setOptions({ outputDir: e.target.value })}
          className="h-8 max-w-[260px] font-mono text-xs"
          placeholder="src/mocks"
        />
      </FieldRow>

      {/* Port */}
      <FieldRow label="Server port">
        <Input
          type="number"
          value={options.port}
          onChange={(e) => wizard.setOptions({ port: Number(e.target.value) || 3001 })}
          className="h-8 max-w-[120px] font-mono text-xs"
        />
      </FieldRow>

      {/* Seed count */}
      <FieldRow label="Records per collection">
        <Input
          type="number"
          value={options.seedCount}
          onChange={(e) => wizard.setOptions({ seedCount: Number(e.target.value) || 20 })}
          className="h-8 max-w-[120px] font-mono text-xs"
        />
      </FieldRow>

      {/* DevTools connection */}
      <FieldRow label="Connect to DevTools on start">
        <Switch
          checked={options.connectDevTools}
          onCheckedChange={(checked) => wizard.setOptions({ connectDevTools: checked })}
          className="scale-75"
        />
      </FieldRow>

      {/* Built-in scenarios info */}
      <div className="rounded-lg border border-border-subtle bg-muted/20 px-4 py-3">
        <p className="text-body-xs text-muted-foreground">
          Built-in scenarios available via Admin API (<span className="font-mono">/__admin/scenarios/:name</span>):
        </p>
        <ul className="mt-1.5 space-y-0.5 text-body-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">happy-path</span> — full CRUD with auto-generated data</li>
          <li><span className="font-mono text-foreground">empty</span> — all list endpoints return []</li>
          <li><span className="font-mono text-foreground">server-error</span> — 500/502/503 errors</li>
          <li><span className="font-mono text-foreground">slow-network</span> — 3G latency on all endpoints</li>
        </ul>
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
