import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { MiddlewareDemo, OnErrorDemo } from "./_components"

const middlewareConfigCode = `import { defineApi } from "@noverax/nexus/define"
import { logMiddleware, authMiddleware } from "@noverax/nexus/middleware"

const api = defineApi({
  baseURL: "http://localhost:4000",
  middleware: [
    logMiddleware(),
    authMiddleware(() => getAuthToken()),
    // Custom middleware
    async (ctx, next) => {
      console.log(\`[\${ctx.source}] \${ctx.method}\`)
      const response = await next()
      return {
        ...response,
        data: {
          ...response.data as Record<string, unknown>,
          _meta: { timestamp: new Date().toISOString() },
        },
      }
    },
  ],
  groups: { users, misc },
})`

const middlewareExampleCode = `// Middleware transforms responses — adds _meta to every response
const data = await caller("api")("users:getAll")

// data now contains:
// {
//   data: [...users],
//   total: 3,
//   _meta: {
//     timestamp: "2025-01-01T00:00:00.000Z"
//   }
// }`

const onErrorCode = `// Error middleware catches errors before they reach the client
// Useful for server-side logging, monitoring, error tracking

async (ctx, next) => {
  try {
    return await next()
  } catch (error) {
    console.error(\`[\${ctx.source}] \${ctx.method}\`, error)
    throw error // re-throw to let the caller handle it
  }
}`

const logCode = `// Built-in logMiddleware logs every request
import { logMiddleware } from "@noverax/nexus/middleware"

const api = defineApi({
  baseURL: "...",
  middleware: [logMiddleware()],
  groups: { ... },
})

// Logs: [nexus] api users:getAll 200 45ms`

export const metadata = docsMetadata(
  "Middleware",
  "Request middleware for logging, transformation, and error handling."
)

export default function MiddlewareExamplesPage() {
  return (
    <>
      <PageHeader
        title="Middleware"
        description="Request middleware for logging, transformation, and error handling."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Middleware Configuration"
          description="Middleware functions are defined on the source. They run in order for every request."
          code={middlewareConfigCode}
          learnMoreHref="/docs/middleware/overview"
          learnMoreLabel="Middleware docs"
        >
          <p className="text-sm text-muted-foreground">
            Middleware receives a context object and a next function. Call next() to continue the
            chain and get the response. You can modify both the request context and the response.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Response Transformation"
          description="Middleware can transform responses — for example, adding metadata to every response."
          code={middlewareExampleCode}
        >
          <MiddlewareDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Error Handling"
          description="Wrap next() in try/catch to handle errors. Useful for logging and monitoring."
          code={onErrorCode}
        >
          <OnErrorDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Built-in Log Middleware"
          description="Use logMiddleware() for automatic request logging with timing."
          code={logCode}
        >
          <p className="text-sm text-muted-foreground">
            Check your server terminal after running the demos above — logMiddleware logs every
            request with source, endpoint, status, and duration.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
