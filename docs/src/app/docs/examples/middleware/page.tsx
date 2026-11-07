import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"
import { ServerRunSandbox } from "@/site/sandbox/server-run-sandbox"

import { MiddlewareDemo, OnErrorDemo } from "./_components"

const middlewareConfigCode = `import { defineApi } from "@noverax/courier/define"
import { authMiddleware, logMiddleware } from "@noverax/courier/middleware"
import { defineMiddleware, isHTTPError } from "@noverax/courier/server"

// \`log\` takes each line: here, the docs' request inspector; in an app, your logger
const middlewareApi = defineApi({
  baseURL: "http://localhost:4000",
  middleware: [
    logMiddleware({ logger: log }),
    // A made-up token: the backend reads none, and the inspector names its header
    authMiddleware({ getToken: () => "made-up-docs-token" }),
    // Custom: stamp every answer that is a record
    defineMiddleware("stamp", "after", (_ctx, response) => ({
      ...response,
      data: { ...(response.data as object), _meta: { timestamp: new Date().toISOString() } },
    })),
    // Custom: tell a failure, then pass it on
    defineMiddleware("failures", "wrap", async (ctx, next) => {
      try {
        return await next()
      } catch (error) {
        log(\`[\${ctx.source}] \${ctx.group}.\${ctx.method} failed: \${isHTTPError(error) ? error.status : "error"}\`)
        throw error
      }
    }),
  ],
  groups: { users, misc },
})`

const middlewareExampleCode = `// The stamp adds _meta to what the API answered
const data = await middlewareCaller.users.getAll()

// data now holds:
// {
//   data: [...users],
//   total: 3,
//   page: 1,
//   limit: 10,
//   _meta: { timestamp: "2026-11-07T12:00:00.000Z" }
// }`

const serverExampleCode = `// The same call in a Server Action: the chain runs on the server either way
"use server"

import { createAction } from "@noverax/courier-next"
import { sources } from "@/api"

const action = createAction(sources, "middlewareApi")
const data = await action.users.getAll() // _meta, as through the proxy route`

const onErrorCode = `// The failures link tells a failure, then passes it on to the caller
defineMiddleware("failures", "wrap", async (ctx, next) => {
  try {
    return await next()
  } catch (error) {
    log(\`[\${ctx.source}] \${ctx.group}.\${ctx.method} failed: \${isHTTPError(error) ? error.status : "error"}\`)
    throw error // the caller still gets the HTTPError
  }
})`

const logCode = `// The built-in log middleware: one line a call, with its status and time
import { logMiddleware } from "@noverax/courier/middleware"

logMiddleware({ logger: (line) => log(line) })

// middlewareApi:users:getAll → 200 (5ms)`

export const metadata = exampleMetadata("middleware")

export default function MiddlewareExamplesPage() {
  return (
    <ExamplePage name="middleware">
      <ExampleSection
        title="Middleware Configuration"
        description="Middleware functions are defined on the source. They run in order for every request, on the server: for a call through the proxy route as for one made on the server."
        code={middlewareConfigCode}
        learnMore={{ href: "/docs/middleware/overview", label: "Middleware docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          This is the chain the sandboxes below call through. Under each, its requests show the
          chain link by link — each with its phase and the time it took, the header the auth link
          added, by name alone — and the lines the chain logged.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Response Transformation"
        description="Middleware can transform responses: the stamp adds _meta to every answer that is a record."
        code={middlewareExampleCode}
        server={{
          code: serverExampleCode,
          sandbox: (
            <ServerRunSandbox
              label="action.users.getAll() — on the server"
              runs={[{ button: "Fetch users on the server", name: "middleware.users" }]}
            />
          ),
        }}
      >
        <MiddlewareDemo />
      </ExampleSection>

      <ExampleSection
        title="Error Handling"
        description="Wrap next() in try/catch to handle errors: the failures link tells the failure, then passes it on, and the caller still catches the HTTPError."
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
          logMiddleware writes one line a call: its source, group and endpoint, its status and how
          long it took. Here its logger hands each line to the request inspector — under each
          sandbox above, beside the call it is about — rather than to the server&apos;s own log,
          which a visitor cannot read.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
