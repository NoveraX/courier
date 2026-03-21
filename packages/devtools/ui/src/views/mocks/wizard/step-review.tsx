import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MethodBadge } from "@/components/shared/method-badge";

import type { UseMockGeneratorReturn } from "./use-mock-generator";

interface ReviewStepProps {
  wizard: UseMockGeneratorReturn;
}

export function ReviewStep({ wizard }: ReviewStepProps): React.ReactElement {
  const { endpoints } = wizard.state;
  const totalCount = countEndpoints(endpoints);
  const selectedCount = countSelected(endpoints);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h3 className="text-h3">Review Endpoints</h3>
          <p className="text-body-sm text-muted-foreground">
            {selectedCount} of {totalCount} endpoints selected
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={wizard.toggleAll}>
          {selectedCount === totalCount ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {Object.entries(endpoints).map(([sourceName, groups]) => (
        <div key={sourceName} className="space-y-2">
          {Object.keys(endpoints).length > 1 && (
            <p className="text-caption text-muted-foreground">{sourceName}</p>
          )}
          {Object.entries(groups).map(([groupName, eps]) => {
            const groupSelected = eps.filter((e) => e.selected).length;
            const allSelected = groupSelected === eps.length;

            return (
              <div key={groupName} className="rounded-lg border border-border-subtle overflow-hidden">
                <button
                  type="button"
                  onClick={() => wizard.toggleGroup(sourceName, groupName)}
                  className="flex w-full cursor-pointer items-center gap-2.5 bg-muted/30 px-3 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={allSelected ? true : groupSelected > 0 ? "indeterminate" : false}
                    className="size-3.5"
                  />
                  <span className="text-body-sm font-medium">{groupName}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {groupSelected}/{eps.length}
                  </Badge>
                </button>

                <div className="divide-y divide-border-subtle">
                  {eps.map((ep) => (
                    <button
                      key={ep.endpoint}
                      type="button"
                      onClick={() => wizard.toggleEndpoint(sourceName, groupName, ep.endpoint)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 hover:bg-muted/20"
                    >
                      <Checkbox checked={ep.selected} className="size-3.5" />
                      <MethodBadge method={ep.httpMethod} />
                      <span className="text-body-sm font-mono truncate">{ep.endpoint}</span>
                      {ep.path && (
                        <span className="text-body-xs text-muted-foreground font-mono ml-auto truncate">
                          {ep.path}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function countEndpoints(
  endpoints: Record<string, Record<string, Array<{ selected: boolean }>>>,
): number {
  return Object.values(endpoints)
    .flatMap((g) => Object.values(g))
    .flat().length;
}

function countSelected(
  endpoints: Record<string, Record<string, Array<{ selected: boolean }>>>,
): number {
  return Object.values(endpoints)
    .flatMap((g) => Object.values(g))
    .flat()
    .filter((e) => e.selected).length;
}
