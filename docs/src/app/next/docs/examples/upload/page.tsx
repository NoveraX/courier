import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { ProgressUploadDemo, SimpleUploadDemo } from "./_components"

const simpleCode = `import { caller } from "@/lib/caller"

const formData = new FormData()
formData.append("file", file)
formData.append("description", "My upload")

// FormData is auto-detected — courier sends multipart/form-data
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

const sourceCode = `import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

const files = defineGroup({
  prefix: "upload",
  endpoints: {
    // FormData auto-detected — no bodySerializer needed
    // Empty files are automatically removed before sending
    upload: endpoint.post("").variables<FormData>().response<UploadResponse>(),
  },
})`

export const metadata = docsMetadata(
  "File Upload",
  "FormData file upload with progress tracking. Courier auto-detects FormData and handles encoding."
)

export default function UploadExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/upload"
      title="File Upload"
      description="FormData file upload with progress tracking. Courier auto-detects FormData and handles encoding."
      mode="both"
    >
      <ExampleSection
        title="Simple Upload"
        description="Single-request file upload. FormData is auto-detected by courier."
        code={simpleCode}
        learnMore={{ href: "/docs/advanced/upload", label: "Upload docs" }}
      >
        <SimpleUploadDemo />
      </ExampleSection>

      <ExampleSection
        title="Upload with Progress"
        description="onUploadProgress tracks real upload progress. HTTP/2 compatible — uses ReadableStream internally instead of XHR."
        code={progressCode}
      >
        <ProgressUploadDemo />
      </ExampleSection>

      <ExampleSection
        title="Source Definition"
        description="FormData is automatically detected. No special configuration needed."
        code={sourceCode}
      >
        <p className="m-0 text-body text-fg-muted">
          When variables is FormData, courier skips JSON encoding and sends it as
          multipart/form-data. Empty files are automatically removed before sending.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
