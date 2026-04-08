/**
 * Public-facing entry for the four mock route detail tabs.
 *
 * The General and Handler tabs grew large enough to warrant their own files
 * (`route-general-tab.tsx`, `route-handler-tab.tsx`) — this module re-exports
 * them and keeps the simpler Schema / Example tabs colocated since they fit
 * comfortably in a few lines.
 */

import { Badge } from "@/components/ui/badge";
import { JsonTree } from "@/components/shared/json-tree";
import { DetailEmpty, DetailSection } from "@/components/shared/detail-panel/detail-rows";

export { GeneralTab } from "./route-general-tab";
export { HandlerTab } from "./route-handler-tab";

interface SchemaTabProps {
  schema?: Record<string, string>;
}

export function SchemaTab({ schema }: SchemaTabProps): React.ReactElement {
  if (!schema) return <DetailEmpty label="No schema available" />;

  return (
    <div className="space-y-5 p-4">
      <DetailSection title="Response Fields">
        {Object.entries(schema).map(([field, type]) => (
          <div key={field} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="font-mono text-body-sm text-violet-400/90">{field}</span>
            <Badge variant="secondary" className="text-[10px] font-mono">{type}</Badge>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}

interface ExampleTabProps {
  data: unknown;
}

export function ExampleTab({ data }: ExampleTabProps): React.ReactElement {
  if (data == null) return <DetailEmpty label="No example available" />;

  return (
    <div className="p-4">
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Auto-generated Response
      </h4>
      <JsonTree data={data} fill showCopy />
    </div>
  );
}
