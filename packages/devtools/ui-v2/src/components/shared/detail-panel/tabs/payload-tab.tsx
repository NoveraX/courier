import { ScrollArea } from "@/components/ui/scroll-area";
import { JsonTree } from "@/components/shared/json-tree";
import type { RequestEntry } from "@/store/types";

interface PayloadTabProps {
  request: RequestEntry;
}

export function PayloadTab({ request }: PayloadTabProps): React.ReactElement {
  const hasVariables = request.variables != null;
  const hasValidated = request.validatedVariables != null;
  const hasSentBody = request.sentBody != null;

  if (!hasVariables && !hasSentBody) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No payload data
      </p>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {hasVariables && (
          <DataSection title="Variables" data={request.variables} />
        )}

        {hasValidated && (
          <DataSection title="Validated Variables" data={request.validatedVariables} />
        )}

        {hasSentBody && (
          <DataSection title="Sent Body" data={request.sentBody} />
        )}
      </div>
    </ScrollArea>
  );
}

function DataSection({
  title,
  data,
}: {
  title: string;
  data: unknown;
}): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{title}</h4>
      <JsonTree data={data} maxHeight="300px" />
    </div>
  );
}
