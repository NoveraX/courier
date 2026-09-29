import { CopyButton } from "@/components/shared/copy-button";
import { JsonTree } from "@/components/shared/json-tree";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RequestEntry } from "@/store/types";

interface ResponseTabProps {
  request: RequestEntry;
}

export function ResponseTab({ request }: ResponseTabProps): React.ReactElement {
  const hasData = request.data != null;
  const hasRaw = !!request.rawResponse;
  const hasValidated = request.validatedResponse != null;

  if (!hasData && !hasRaw) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        {request.status === "pending" ? "Waiting for response…" : "No response data"}
      </p>
    );
  }

  const tabCount = [hasData, hasRaw, hasValidated].filter(Boolean).length;

  if (tabCount === 1 && hasData) {
    return (
      <div className="flex h-full flex-col p-4">
        <JsonTree data={request.data} fill />
      </div>
    );
  }

  return (
    <Tabs defaultValue={hasData ? "parsed" : "raw"} className="flex h-full flex-col">
      <TabsList className="mx-4 mt-2 w-fit">
        {hasData && <TabsTrigger value="parsed">Parsed</TabsTrigger>}
        {hasRaw && <TabsTrigger value="raw">Raw</TabsTrigger>}
        {hasValidated && <TabsTrigger value="validated">Validated</TabsTrigger>}
      </TabsList>

      {hasData && (
        <TabsContent value="parsed" className="mt-0 flex min-h-0 flex-col p-4">
          <JsonTree data={request.data} fill />
        </TabsContent>
      )}

      {hasRaw && (
        <TabsContent value="raw" className="mt-0 min-h-0 overflow-auto p-4">
          <div className="flex justify-end">
            <CopyButton value={request.rawResponse!} label="Copy raw response" />
          </div>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-border-subtle bg-background-inset p-3 mono-sm">
            {request.rawResponse}
          </pre>
        </TabsContent>
      )}

      {hasValidated && (
        <TabsContent value="validated" className="mt-0 flex min-h-0 flex-col p-4">
          <JsonTree data={request.validatedResponse} fill />
        </TabsContent>
      )}
    </Tabs>
  );
}
