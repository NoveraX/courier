import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { ProgressUploadDemo, SimpleUploadDemo } from "./_components"

const simpleCode = `import { caller } from "@/lib/caller"

const formData = new FormData()
formData.append("file", file)
formData.append("description", "My upload")

// FormData is auto-detected — nexus sends multipart/form-data
const result = await caller.files.upload(formData)`

const progressCode = `import { caller } from "@/lib/caller"

const formData = new FormData()
formData.append("file", file)

// onUploadProgress tracks real upload progress (HTTP/2 compatible)
const result = await caller.files.with({
  onUploadProgress: (progress) => {
    setProgress(Math.round(progress.percent * 100))
  },
}).upload(formData)`

const sourceCode = `import { defineGroup, endpoint } from "@noverax/nexus/define"

const files = defineGroup({
  prefix: "upload",
  endpoints: {
    // FormData auto-detected — no bodySerializer needed
    // Empty files are automatically removed before sending
    upload: endpoint<UploadResponse, FormData>()((http) => http.post()),
  },
})`

export const metadata = docsMetadata(
  "File Upload",
  "FormData file upload with progress tracking. Nexus auto-detects FormData and handles encoding."
)

export default function UploadExamplesPage() {
  return (
    <>
      <PageHeader
        title="File Upload"
        description="FormData file upload with progress tracking. Nexus auto-detects FormData and handles encoding."
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Simple Upload"
          description="Single-request file upload. FormData is auto-detected by nexus."
          code={simpleCode}
          learnMoreHref="/docs/advanced/upload"
          learnMoreLabel="Upload docs"
        >
          <SimpleUploadDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Upload with Progress"
          description="onUploadProgress tracks real upload progress. HTTP/2 compatible — uses ReadableStream internally instead of XHR."
          code={progressCode}
        >
          <ProgressUploadDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Source Definition"
          description="FormData is automatically detected. No special configuration needed."
          code={sourceCode}
        >
          <p className="text-sm text-muted-foreground">
            When variables is FormData, nexus skips JSON encoding and sends it as
            multipart/form-data. Empty files are automatically removed before sending.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
