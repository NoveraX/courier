import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { CatchDemo, GuardDemo } from "./_components"

const catchCode = `import { HTTPError } from "@noverax/nexus"

try {
  await request("mockApi")("misc:error", { code: 404 })
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.status)  // 404
    console.log(error.data)    // { success: false, message: "..." }
    console.log(error.headers) // Headers object
  }
}`

const guardCode = `import { isHTTPError } from "@noverax/nexus"

try {
  await request("mockApi")("misc:error", { code: 403 })
} catch (error) {
  if (isHTTPError(error)) {
    // TypeScript knows: error.status, error.data, error.headers
    handleHttpError(error)
  } else {
    // Network error, timeout, etc.
    handleUnknownError(error)
  }
}`

const globalCode = `import { createClientRequest } from "@noverax/nexus"

const request = createClientRequest({
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

export const metadata = docsMetadata("Error Handling", "HTTPError class, isHTTPError type guard, and global error callbacks.")

export default function ErrorsExamplesPage() {
  return (
    <>
      <PageHeader
        title="Error Handling"
        description="HTTPError class, isHTTPError type guard, and global error callbacks."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="HTTPError — Catch & Inspect"
          description="HTTPError provides status, data, and headers. Select an error code and trigger it."
          code={catchCode}
          learnMoreHref="/docs/core-concepts/error-handling"
          learnMoreLabel="Error handling docs"
        >
          <CatchDemo />
        </ExampleBlock>

        <ExampleBlock
          title="isHTTPError — Type Guard"
          description="Use isHTTPError() to narrow unknown errors. TypeScript infers status, data, and headers."
          code={guardCode}
        >
          <GuardDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Global onError / onSuccess"
          description="Configure global callbacks for all requests in createClientRequest defaults."
          code={globalCode}
        >
          <p className="text-sm text-muted-foreground">
            Global callbacks fire for every request. Useful for toast notifications, auth redirects,
            and logging.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
