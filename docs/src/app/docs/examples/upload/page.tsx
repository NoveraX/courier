import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { ProgressUploadDemo, SimpleUploadDemo } from "./_components"

const simpleCode = `import { caller } from "@/lib/caller"

const formData = new FormData()
formData.append("file", file)
formData.append("description", "My upload")

// FormData is auto-detected — courier sends multipart/form-data
const result = await caller.files.upload(formData)`

const progressCode = `import { smoothProgress } from "@noverax/courier"
import { caller } from "@/lib/caller"

const formData = new FormData()
formData.append("file", file)

// The browser reports progress in steps: smoothProgress moves the bar between them
const result = await caller.files.with({
  onUploadProgress: smoothProgress((progress) => {
    setProgress(progress.percent * 100)
  }),
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

export const metadata = exampleMetadata("upload")

export default function UploadExamplesPage() {
  return (
    <ExamplePage name="upload">
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
        description="A browser reports an upload's progress over XMLHttpRequest, since fetch has none — every 100 ms or so, a step of several percent each on a slow link. smoothProgress moves the bar between the reports: never ahead of the upload, never back, and at rest at 100%."
        code={progressCode}
        learnMore={{
          href: "/docs/advanced/upload#a-bar-that-moves-smoothly",
          label: "smoothProgress",
        }}
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
