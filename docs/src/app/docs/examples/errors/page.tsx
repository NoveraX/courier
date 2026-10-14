import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { CatchDemo, GuardDemo } from "./_components"

const catchCode = `import { HTTPError } from "@noverax/courier"
import { caller } from "@/lib/caller"

try {
  await caller.misc.error({ code: 404 })
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.status)  // 404
    console.log(error.data)    // { success: false, message: "..." }
    console.log(error.headers) // Headers object
  }
}`

const guardCode = `import { isHTTPError } from "@noverax/courier"
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

const globalCode = `import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "@/courier.routes"

const caller = createProxyCaller(apiRoutes, {
  // Called for every failed request
  onError: (error) => {
    toast.error(\`Request failed: \${error.status}\`)

    if (error.status === 401) {
      router.push("/login")
    }
  },

  // Called for every successful request
  onSuccess: (data) => {
    console.log("Success:", data)
  },
})`

export const metadata = docsMetadata(
  "Error Handling",
  "HTTPError class, isHTTPError type guard, and global error callbacks."
)

export default function ErrorsExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/errors"
      title="Error Handling"
      description="HTTPError class, isHTTPError type guard, and global error callbacks."
      mode="both"
    >
      <ExampleSection
        title="HTTPError — Catch & Inspect"
        description="HTTPError provides status, data, and headers. Select an error code and trigger it."
        code={catchCode}
        learnMore={{ href: "/docs/core-concepts/error-handling", label: "Error handling docs" }}
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
