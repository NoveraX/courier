import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { MiddlewareDemo, OnErrorDemo } from "./_components"

const middlewareConfigCode = `import { defineApi } from "@noverax/courier/define"
import { logMiddleware, authMiddleware } from "@noverax/courier/middleware"

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
const data = await caller.users.getAll()

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
import { logMiddleware } from "@noverax/courier/middleware"

const api = defineApi({
  baseURL: "...",
  middleware: [logMiddleware()],
  groups: { ... },
})

// Logs: [courier] api users:getAll 200 45ms`

export const metadata = docsMetadata(
  "Middleware",
  "Request middleware for logging, transformation, and error handling."
)

export default function MiddlewareExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/middleware"
      title="Middleware"
      description="Request middleware for logging, transformation, and error handling."
      mode="both"
    >
      <ExampleSection
        title="Middleware Configuration"
        description="Middleware functions are defined on the source. They run in order for every request."
        code={middlewareConfigCode}
        learnMore={{ href: "/docs/middleware/overview", label: "Middleware docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          Middleware receives a context object and a next function. Call next() to continue the
          chain and get the response. You can modify both the request context and the response.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Response Transformation"
        description="Middleware can transform responses — for example, adding metadata to every response."
        code={middlewareExampleCode}
      >
        <MiddlewareDemo />
      </ExampleSection>

      <ExampleSection
        title="Error Handling"
        description="Wrap next() in try/catch to handle errors. Useful for logging and monitoring."
        code={onErrorCode}
      >
        <OnErrorDemo />
      </ExampleSection>

      <ExampleSection
        title="Built-in Log Middleware"
        description="Use logMiddleware() for automatic request logging with timing."
        code={logCode}
      >
        <p className="m-0 text-body text-fg-muted">
          Check your server terminal after running the demos above — logMiddleware logs every
          request with source, endpoint, status, and duration.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
