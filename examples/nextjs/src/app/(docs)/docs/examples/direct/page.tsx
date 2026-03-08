import { ExampleBlock } from "@/components/docs/example-block"
import { ResponseViewer } from "@/components/docs/response-viewer"
import { PageHeader } from "@/components/layout/page-header"
import { directRequest } from "@/lib/direct-request"
import { docsMetadata } from "@/lib/metadata"

const setupCode = `// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { methods } from "@/api"

export const directRequest = createDirectRequest(methods)`

const fetchAllCode = `import { directRequest } from "@/lib/direct-request"

// Server Component — runs on the server, zero client JS
const users = await directRequest("mockApi")("users:getAll", {})`

const fetchOneCode = `// Path params work identically to proxy mode
const user = await directRequest("mockApi")("users:getById", { id: 1 })`

const fetchPostsCode = `// Access any request group — same API as proxy mode
const posts = await directRequest("mockApi")("posts:getAll", {})`

export const metadata = docsMetadata(
  "Direct Mode",
  "Server Components fetch data directly from the backend — no proxy, no API route, no client JS."
)

export default async function DirectExamplesPage() {
  const users = await directRequest("mockApi")("users:getAll", {})
  const user = await directRequest("mockApi")("users:getById", { id: 1 })
  const posts = await directRequest("mockApi")("posts:getAll", {})

  return (
    <>
      <PageHeader
        title="Direct Mode"
        description="Server Components fetch data directly from the backend — no proxy, no API route, no client JS."
        badge="Server-Side"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Setup"
          description="createDirectRequest uses the same source definitions as proxy mode. One line to set up."
          code={setupCode}
          learnMoreHref="/docs/server-side/direct"
          learnMoreLabel="Direct mode docs"
        >
          <p className="text-sm text-muted-foreground">
            Direct mode calls the backend directly from the server. No{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/request</code> proxy hop —
            requests go straight to the backend URL defined in your Request class.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Fetch Users (RSC)"
          description="Data is fetched during server rendering. The response is streamed as HTML — zero client-side fetch."
          code={fetchAllCode}
        >
          <ResponseViewer data={users} status={200} />
        </ExampleBlock>

        <ExampleBlock
          title="Single User"
          description="Path parameters like :id are replaced automatically from the variables object."
          code={fetchOneCode}
        >
          <ResponseViewer data={user} status={200} />
        </ExampleBlock>

        <ExampleBlock
          title="Fetch Posts"
          description="Access any request group the same way. The API surface is identical to proxy mode."
          code={fetchPostsCode}
        >
          <ResponseViewer data={posts} status={200} />
        </ExampleBlock>
      </div>
    </>
  )
}
