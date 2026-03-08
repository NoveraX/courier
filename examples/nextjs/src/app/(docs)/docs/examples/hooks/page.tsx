import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"

import { OnErrorDemo, OnResponseDemo } from "./_components"

const hookConfigCode = `class HookedApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups: { users, misc },

      // Called before each request — for logging, validation
      onRequest: (info) => {
        console.log(\`[onRequest] \${info.source} → \${info.group}:\${info.query}\`)
        return info // return modified info or undefined
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
        console.error(\`[onError] \${info.group}:\${info.query}\`, error.status)
        return undefined // cannot modify or suppress the error
      },
    })
  }
}`

const onResponseCode = `// The onResponse hook adds _hooks metadata to every response
const data = await request("hookedApi")("users:getAll", {})

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
  console.error(\`[\${info.source}] \${info.group}:\${info.query}\`, error.status)

  // Must return undefined — cannot modify or suppress the error
  return undefined
}`

const onRequestCode = `// onRequest fires before each request
// Useful for logging, validation, request metadata

onRequest: (info) => {
  console.log("Source:", info.source)
  console.log("Query:", \`\${info.group}:\${info.query}\`)
  console.log("Variables:", info.variables)

  // Return modified info or undefined to keep original
  return info
}`

export default function HooksExamplesPage() {
  return (
    <>
      <PageHeader
        title="Hooks"
        description="Lifecycle hooks for request interception, response transformation, and error handling."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Hook Configuration"
          description="Hooks are defined on the Request source. They run server-side in the proxy handler."
          code={hookConfigCode}
          learnMoreHref="/docs/advanced/hooks"
          learnMoreLabel="Hooks docs"
        >
          <p className="text-sm text-muted-foreground">
            Three hooks are available: onRequest (before), onResponse (after success), onError
            (after failure). All hooks run on the server — they have access to the full request
            context.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="onResponse — Transform Data"
          description="The onResponse hook adds _hooks metadata to every successful response. Compare with the Basic page to see the difference."
          code={onResponseCode}
        >
          <OnResponseDemo />
        </ExampleBlock>

        <ExampleBlock
          title="onError — Error Handling"
          description="The onError hook fires server-side before the error reaches the client. Check server logs after clicking."
          code={onErrorCode}
        >
          <OnErrorDemo />
        </ExampleBlock>

        <ExampleBlock
          title="onRequest — Request Logging"
          description="Fires before each request. Receives source, group, query, and variables."
          code={onRequestCode}
        >
          <p className="text-sm text-muted-foreground">
            Check your server terminal after running the demos above — onRequest logs every request.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
