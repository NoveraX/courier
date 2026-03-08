"use client"

import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { RunButton } from "@/components/run-button"
import { request, useMutation } from "@/lib/request"

const hookConfigCode = `class HookedApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups: { users, misc },

      // Called before each request — for logging, validation
      onRequest: (info) => {
        console.log(\`[onRequest] \${info.source} → \${info.group}:\${info.query}\`);
        return info; // return modified info or undefined
      },

      // Called after successful response — can transform data
      onResponse: (info, response) => ({
        status: response.status,
        data: {
          ...response.data,
          _hooks: {
            transformedBy: "onResponse",
            timestamp: new Date().toISOString(),
          },
        },
      }),

      // Called on error — for logging, monitoring
      onError: (info, error) => {
        console.error(\`[onError] \${info.group}:\${info.query}\`, error.status);
        return undefined; // cannot modify or suppress the error
      },
    });
  }
}`

const onResponseCode = `// The onResponse hook adds _hooks metadata to every response
const data = await request("hookedApi")("users:getAll", {});

// data now contains:
// {
//   data: [...users],
//   total: 3,
//   _hooks: {
//     transformedBy: "onResponse",
//     timestamp: "2025-01-01T00:00:00.000Z"
//   }
// }`

const onErrorCode = `// onError fires on the server before the error reaches the client
// Useful for server-side logging, monitoring, error tracking

onError: (info, error) => {
  // Log to monitoring service (runs server-side)
  console.error(\`[\${info.source}] \${info.group}:\${info.query}\`, error.status);

  // Must return undefined — cannot modify or suppress the error
  return undefined;
};`

const onRequestCode = `// onRequest fires before each request
// Useful for logging, validation, request metadata

onRequest: (info) => {
  console.log("Source:", info.source);
  console.log("Query:", \`\${info.group}:\${info.query}\`);
  console.log("Variables:", info.variables);

  // Return modified info or undefined to keep original
  return info;
};`

export default function HooksPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hooks</h1>
        <p className="text-muted-foreground mt-1">
          Lifecycle hooks for request interception, response transformation, and error handling.
        </p>
      </div>

      <DemoCard
        title="Hook Configuration"
        description="Hooks are defined on the Request source. They run server-side in the proxy handler."
        code={hookConfigCode}
      >
        <p className="text-sm text-muted-foreground">
          Three hooks are available: onRequest (before), onResponse (after success), onError (after
          failure). All hooks run on the server — they have access to the full request context.
        </p>
      </DemoCard>

      <OnResponseDemo />
      <OnErrorDemo />

      <DemoCard
        title="onRequest — Request Logging"
        description="Fires before each request. Receives source, group, query, and variables."
        code={onRequestCode}
      >
        <p className="text-sm text-muted-foreground">
          Check your server terminal after running the demos above — onRequest logs every request.
        </p>
      </DemoCard>
    </div>
  )
}

function OnResponseDemo() {
  const { mutate, data, isPending, error } = useMutation("hookedApi", "users:getAll")

  return (
    <DemoCard
      title="onResponse — Transform Data"
      description="The onResponse hook adds _hooks metadata to every successful response. Compare with the Basic page to see the difference."
      code={onResponseCode}
    >
      <RunButton loading={isPending} label="Fetch Users (hooked)" onClick={() => mutate({})} />
      {error ? <ResponseViewer error={error.message} /> : null}
      {data ? <ResponseViewer data={data} status={200} /> : null}
    </DemoCard>
  )
}

function OnErrorDemo() {
  const [loading, setLoading] = useState(false)
  const [caughtError, setCaughtError] = useState<{
    status: number
    data: unknown
    message: string
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setCaughtError(null)
    try {
      await request("hookedApi")("misc:error", { code: 500 })
    } catch (e: unknown) {
      const err = e as { status?: number; data?: unknown; message?: string }
      setCaughtError({
        status: err.status ?? 500,
        data: err.data,
        message: err.message ?? "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <DemoCard
      title="onError — Error Handling"
      description="The onError hook fires server-side before the error reaches the client. Check server logs after clicking."
      code={onErrorCode}
    >
      <RunButton loading={loading} label="Trigger 500 Error" onClick={handleClick} />
      {caughtError ? (
        <ResponseViewer
          data={{
            note: "Error caught on client (after server-side onError hook fired)",
            ...caughtError,
          }}
          status={caughtError.status}
        />
      ) : null}
    </DemoCard>
  )
}
