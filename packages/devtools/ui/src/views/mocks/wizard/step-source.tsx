import { Globe, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDevToolsStore } from "@/store";
import { cn } from "@/lib/utils";

import type { UseMockGeneratorReturn } from "./use-mock-generator";

interface SourceStepProps {
  wizard: UseMockGeneratorReturn;
}

export function SourceStep({ wizard }: SourceStepProps): React.ReactElement {
  const { state } = wizard;
  const catalog = useDevToolsStore((s) => s.catalog);
  const sourceNames = Object.keys(catalog);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3">Select API Source</h3>
        <p className="text-body-sm text-muted-foreground">
          Choose which API definitions to generate a mock server from,
          or create a standalone mock without a source.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1.5 rounded-lg border border-border-subtle bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => wizard.setStandalone(false)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            !state.standalone
              ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="size-3" />
          From Source
        </button>
        <button
          type="button"
          onClick={() => wizard.setStandalone(true)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            state.standalone
              ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Server className="size-3" />
          Standalone
        </button>
      </div>

      {/* Source list */}
      {!state.standalone && (
        <div className="space-y-2">
          {sourceNames.length === 0 ? (
            <p className="text-body-sm text-muted-foreground py-8 text-center">
              No API sources found. Import an API first from the APIs page.
            </p>
          ) : (
            sourceNames.map((name) => {
              const source = catalog[name];
              if (!source) return null;
              const groupCount = Object.keys(source.groups).length;
              const endpointCount = Object.values(source.groups)
                .reduce((sum, g) => sum + Object.keys(g.endpoints).length, 0);
              const selected = state.selectedSources.includes(name);

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => wizard.toggleSource(name)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    selected
                      ? "border-accent-brand/50 bg-accent-brand/5 ring-1 ring-accent-brand/20"
                      : "border-border-subtle hover:bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded border transition-colors",
                      selected
                        ? "border-accent-brand bg-accent-brand text-white"
                        : "border-border-strong bg-background",
                    )}
                  >
                    {selected && <span className="text-[9px] font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium truncate">{name}</p>
                    <p className="text-body-xs text-muted-foreground truncate">
                      {source.baseURL || "No base URL"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {groupCount} group{groupCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Standalone info */}
      {state.standalone && (
        <div className="rounded-lg border border-border-subtle bg-muted/20 px-4 py-3">
          <p className="text-body-sm text-muted-foreground">
            Standalone mode creates a mock server without a source API definition.
            Routes will be inferred from endpoint names using REST conventions.
          </p>
        </div>
      )}
    </div>
  );
}
