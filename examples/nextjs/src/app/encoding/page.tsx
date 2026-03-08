"use client";

import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { RunButton } from "@/components/run-button";
import { useMutation } from "@/lib/request";

const sourceConfigCode = `import { Request } from "@noverax/nexus/RequestClass";

class EncodedApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups: { echo: new Echo() },

      // Sends URL-encoded body instead of JSON
      bodyEncoder: (data) =>
        new URLSearchParams(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),

      // Encodes arrays as key[]=val1&key[]=val2
      searchParamsEncoder: (params) => {
        const sp = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            for (const item of value)
              sp.append(\`\${key}[]\`, String(item));
          } else {
            sp.append(key, String(value));
          }
        }
        return sp;
      },

      // Auto-merged into every POST/PUT/PATCH body
      defaultData: { apiVersion: "v2" },
      // Auto-merged into every GET/DELETE query string
      defaultQueryParams: { format: "json" },
    });
  }
}`;

const bodyEncodingCode = `// Default (mockApi): JSON body
await request("mockApi")("echo:send", { name: "John", role: "admin" });
// Content-Type: application/json
// Body: { "name": "John", "role": "admin" }

// Custom (encodedApi): URL-encoded body + defaultData merged
await request("encodedApi")("echo:send", { name: "John", role: "admin" });
// Content-Type: application/x-www-form-urlencoded
// Body: apiVersion=v2&name=John&role=admin`;

const searchParamsCode = `// Custom searchParamsEncoder supports arrays
await request("encodedApi")("echo:retrieve", {
  tags: ["javascript", "react"],
  page: 1,
});
// GET /echo?format=json&apiVersion=v2&tags[]=javascript&tags[]=react&page=1`;

const defaultsCode = `// defaultData auto-merges into POST body
await request("encodedApi")("echo:send", { name: "John" });
// Body includes: apiVersion=v2&name=John

// defaultQueryParams auto-merges into GET query
await request("encodedApi")("echo:retrieve", { page: 1 });
// Query includes: format=json&page=1`;

export default function EncodingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Encoding</h1>
        <p className="text-muted-foreground mt-1">
          Custom body and search params encoding with default values.
        </p>
      </div>

      <DemoCard
        title="Source Configuration"
        description="Configure encoding options on the Request class. These apply to all methods in the source."
        code={sourceConfigCode}
      >
        <p className="text-sm text-muted-foreground">
          The source above configures custom body encoding, search params encoding, and default
          values. See the demos below for interactive examples.
        </p>
      </DemoCard>

      <BodyEncodingDemo />
      <SearchParamsDemo />
      <DefaultsDemo />
    </div>
  );
}

function BodyEncodingDemo() {
  const jsonMutation = useMutation("mockApi", "echo:send");
  const encodedMutation = useMutation("encodedApi", "echo:send");
  const variables = { name: "John", role: "admin" };

  return (
    <DemoCard
      title="Body Encoding"
      description="Compare JSON (default) vs URL-encoded body. Both send the same data to the echo endpoint."
      code={bodyEncodingCode}
    >
      <div className="flex gap-3">
        <RunButton
          loading={jsonMutation.isPending}
          label="JSON (default)"
          onClick={() => jsonMutation.mutate(variables)}
        />
        <RunButton
          loading={encodedMutation.isPending}
          label="URL-Encoded"
          onClick={() => encodedMutation.mutate(variables)}
        />
      </div>
      {jsonMutation.data || encodedMutation.data ? (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {jsonMutation.data ? (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">JSON result:</p>
              <ResponseViewer data={jsonMutation.data} status={200} />
            </div>
          ) : null}
          {encodedMutation.data ? (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                URL-encoded result:
              </p>
              <ResponseViewer data={encodedMutation.data} status={200} />
            </div>
          ) : null}
        </div>
      ) : null}
    </DemoCard>
  );
}

function SearchParamsDemo() {
  const { mutate, data, isPending } = useMutation("encodedApi", "echo:retrieve");

  return (
    <DemoCard
      title="Search Params Encoding"
      description="Custom encoder supports arrays. Arrays are encoded as key[]=val1&key[]=val2."
      code={searchParamsCode}
    >
      <RunButton
        loading={isPending}
        label="Fetch with Arrays"
        onClick={() => mutate({ tags: ["javascript", "react"], page: 1 })}
      />
      {data ? <ResponseViewer data={data} status={200} /> : null}
    </DemoCard>
  );
}

function DefaultsDemo() {
  const postMutation = useMutation("encodedApi", "echo:send");
  const getMutation = useMutation("encodedApi", "echo:retrieve");

  return (
    <DemoCard
      title="Default Data & Query Params"
      description="defaultData merges into POST body. defaultQueryParams merges into GET query string."
      code={defaultsCode}
    >
      <div className="flex gap-3">
        <RunButton
          loading={postMutation.isPending}
          label="POST (see defaultData)"
          onClick={() => postMutation.mutate({ name: "John" })}
        />
        <RunButton
          loading={getMutation.isPending}
          label="GET (see defaultQueryParams)"
          onClick={() => getMutation.mutate({ page: 1 })}
        />
      </div>
      {postMutation.data || getMutation.data ? (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {postMutation.data ? (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                POST body includes apiVersion:
              </p>
              <ResponseViewer data={postMutation.data} status={200} />
            </div>
          ) : null}
          {getMutation.data ? (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                GET query includes format:
              </p>
              <ResponseViewer data={getMutation.data} status={200} />
            </div>
          ) : null}
        </div>
      ) : null}
    </DemoCard>
  );
}
