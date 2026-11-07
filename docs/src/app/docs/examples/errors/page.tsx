import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"
import { ServerRunSandbox } from "@/site/sandbox/server-run-sandbox"

import { CatchDemo, GuardDemo } from "./_components"

// side="page"
const catchCode = `import { HTTPError } from "@noverax/courier/client"
import { caller } from "@/lib/caller"

try {
  await caller.misc.error({ code: 404 })
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.status)  // 404
    console.log(error.data)    // { success: false, message: "..." }
    console.log(error.headers) // Headers: the answer's own
  }
}`

// side="server"
const serverCatchCode = `// The same call in a Server Action: the same HTTPError, caught on the server
"use server"

import { isHTTPError } from "@noverax/courier/server"
import { createAction } from "@noverax/courier-next"
import { sources } from "@/api"

const action = createAction(sources, "api")

try {
  await action.misc.error({ code: 404 })
} catch (error) {
  if (isHTTPError(error)) console.log(error.status, error.data)
}`

// side="page"
const guardCode = `import { isHTTPError } from "@noverax/courier/client"
import { caller } from "@/lib/caller"

try {
  await caller.misc.error({ code: 403 })
} catch (error) {
  if (isHTTPError(error)) {
    // TypeScript knows: error.status, error.data, error.headers
    handleHttpError(error)
  } else {
    // Network error, timeout, etc.
    handleUnknownError(error)
  }
}`

// side="page"
const globalCode = `import { createProxyCaller, isHTTPError } from "@noverax/courier/client"
import { routes } from "@noverax/courier/routes"

const caller = createProxyCaller(routes.api, {
  // Called for every failed request: an HTTP error, a network failure or a timeout
  onError: (error) => {
    toast.error(\`Request failed: \${error.message}\`)

    if (isHTTPError(error) && error.status === 401) {
      router.push("/login")
    }
  },

  // Called for every successful request
  onSuccess: (data) => {
    console.log("Success:", data)
  },
})`

export const metadata = exampleMetadata("errors")

export default function ErrorsExamplesPage() {
  return (
    <ExamplePage name="errors">
      <ExampleSection
        title="HTTPError — Catch & Inspect"
        description="HTTPError provides status, data, and headers. Select an error code and trigger it: the request below shows which leg answered with the error — here the API, its answer passed on by the route. This site's server names each call in X-Courier-Rid, so the id error.headers holds is the one the request shows."
        code={catchCode}
        learnMore={{ href: "/docs/core-concepts/error-handling", label: "Error handling docs" }}
        server={{
          code: serverCatchCode,
          sandbox: (
            <ServerRunSandbox
              label="action.misc.error({ code }) — on the server"
              runs={[{ button: "Trigger it on the server", name: "errors.error" }]}
              choice={{ label: "code", options: [404, 400, 401, 403, 422, 500, 502, 503] }}
            />
          ),
        }}
      >
        <CatchDemo />
      </ExampleSection>

      <ExampleSection
        title="isHTTPError — Type Guard"
        description="Use isHTTPError() to narrow unknown errors. TypeScript infers status, data, and headers."
        code={guardCode}
      >
        <GuardDemo />
      </ExampleSection>

      <ExampleSection
        title="Global onError / onSuccess"
        description="Configure global callbacks for all requests in createProxyCaller defaults."
        code={globalCode}
      >
        <p className="m-0 text-body text-fg-muted">
          Global callbacks fire for every request. Useful for toast notifications, auth redirects,
          and logging.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
