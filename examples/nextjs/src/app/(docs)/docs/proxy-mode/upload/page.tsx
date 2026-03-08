import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const basicUploadCode = `"use client"

import { useState } from "react"
import { request } from "@/lib/request"

export function AvatarUpload() {
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("avatar", file)

    setUploading(true)
    setProgress(0)

    try {
      await request("myApi", {
        onUploadProgress: ({ percent }) => {
          setProgress(Math.round(percent * 100))
        },
      })("users:uploadAvatar", formData)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleUpload} />
      {uploading && <progress value={progress} max={100} />}
    </div>
  )
}`

const progressTypeCode = `type UploadProgress = {
  // 0 to 1 — multiply by 100 for percentage
  percent: number

  // Bytes uploaded so far
  transferredBytes: number

  // Total file size in bytes
  totalBytes: number
}

// Usage:
onUploadProgress: (progress) => {
  console.log(\`\${Math.round(progress.percent * 100)}%\`)
  console.log(\`\${progress.transferredBytes} / \${progress.totalBytes} bytes\`)
}`

const multiFileCode = `"use client"

import { useState } from "react"
import { request } from "@/lib/request"

export function DocumentUpload() {
  const [progress, setProgress] = useState(0)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    const formData = new FormData()

    // Append multiple files under the same key or different keys
    for (const file of files) {
      formData.append("documents", file)
    }

    // Add metadata alongside files
    formData.append("folder", "invoices")
    formData.append("tags", "2024,finance")

    await request("myApi", {
      onUploadProgress: ({ percent }) => {
        setProgress(Math.round(percent * 100))
      },
    })("files:upload", formData)
  }

  return (
    <div>
      <input type="file" multiple onChange={handleUpload} />
      <p>{progress}% uploaded</p>
    </div>
  )
}`

const formDataCompositionCode = `// When sending FormData through the proxy, Nexus composes it like this:

// Your FormData:
formData.append("avatar", file)
formData.append("name", "profile-pic")

// What gets sent to /api/request:
// _source  = "myApi"            ← meta field
// _group   = "users"            ← meta field
// _query   = "uploadAvatar"     ← meta field
// _options = '{"timeout":30000}'← meta field (JSON string)
// avatar   = File               ← your data
// name     = "profile-pic"      ← your data

// The API route strips _source, _group, _query, _options
// and passes a clean FormData with only your data to the method`

const emptyFileCode = `// Nexus automatically removes empty files from FormData.
// This prevents sending 0-byte File objects that can cause backend errors.

const formData = new FormData()
formData.append("avatar", file)          // File with content → kept
formData.append("thumbnail", emptyFile)  // File with size 0 → removed

// Only "avatar" is sent to the backend`

const xhrExplanationCode = `// Why XHR instead of fetch?
//
// The Fetch API does not support upload progress tracking.
// ReadableStream + duplex: "half" only works on HTTP/2 and has
// limited browser support.
//
// XMLHttpRequest provides real network-level progress via the
// upload.onprogress event, which works on both HTTP/1.1 and HTTP/2.
//
// Nexus automatically switches from fetch (ky) to XHR when
// onUploadProgress is provided. No configuration needed.

// Standard request — uses ky (fetch)
await request("myApi")("users:getAll")

// Upload request — automatically uses XHR
await request("myApi", {
  onUploadProgress: (p) => console.log(p.percent),
})("users:uploadAvatar", formData)`

const warningsCode = `// When using onUploadProgress (XHR transport), these options are ignored:

await request("myApi", {
  onUploadProgress: ({ percent }) => setProgress(percent),

  // ⚠️ Ignored — XHR does not support the fetch cache API
  cache: "no-store",

  // ⚠️ Ignored — XHR cannot track download progress simultaneously
  onDownloadProgress: () => {},

  // ⚠️ Ignored — Next.js-specific fetch option, not available in XHR
  next: { revalidate: 0 },
})("files:upload", formData)

// In development, Nexus logs warnings for each ignored option.
// In production, they are silently ignored.`

export default async function UploadPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="File Upload"
        description="Upload files through the proxy with real-time progress tracking via XHR."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Nexus supports file uploads through proxy mode using FormData. When you provide an{" "}
          <InlineCode>onUploadProgress</InlineCode> callback, Nexus automatically switches from{" "}
          <InlineCode>fetch</InlineCode> to <InlineCode>XMLHttpRequest</InlineCode> for real
          network-level progress tracking.
        </p>
      </Prose>

      <Prose>
        <h2 id="basic-upload">Basic file upload</h2>

        <p>
          Create a FormData object with your files, pass it as variables, and use{" "}
          <InlineCode>onUploadProgress</InlineCode> to track progress:
        </p>
      </Prose>

      <CodeBlock code={basicUploadCode} filename="components/avatar-upload.tsx" />

      <Prose>
        <h2 id="progress-type">Progress tracking</h2>

        <p>
          The <InlineCode>onUploadProgress</InlineCode> callback receives an{" "}
          <InlineCode>UploadProgress</InlineCode> object with three fields:
        </p>
      </Prose>

      <CodeBlock code={progressTypeCode} language="typescript" />

      <Callout variant="info" title="lengthComputable">
        <p>
          Progress events only fire when the browser knows the total size. For FormData uploads,
          this is always the case. The <InlineCode>percent</InlineCode> field ranges from 0 to 1.
        </p>
      </Callout>

      <Prose>
        <h2 id="multi-file">Multi-file upload</h2>

        <p>
          Upload multiple files in a single request by appending them to the same FormData. You can
          also include metadata fields alongside the files:
        </p>
      </Prose>

      <CodeBlock code={multiFileCode} filename="components/document-upload.tsx" />

      <Prose>
        <h2 id="formdata-composition">FormData composition</h2>

        <p>
          When FormData is sent through the proxy, Nexus appends metadata fields with underscore
          prefixes. The API route strips these before forwarding to your method:
        </p>
      </Prose>

      <CodeBlock code={formDataCompositionCode} language="typescript" />

      <Prose>
        <h2 id="empty-files">Empty file handling</h2>

        <p>
          Nexus automatically detects and removes empty files (0 bytes) from FormData before sending
          to the backend. This prevents common issues with optional file inputs that submit empty{" "}
          <InlineCode>File</InlineCode> objects:
        </p>
      </Prose>

      <CodeBlock code={emptyFileCode} language="typescript" />

      <Prose>
        <h2 id="xhr-transport">Why XHR?</h2>

        <p>
          Nexus uses <InlineCode>XMLHttpRequest</InlineCode> instead of{" "}
          <InlineCode>fetch</InlineCode> for uploads because the Fetch API does not support upload
          progress tracking. The switch is automatic and transparent:
        </p>
      </Prose>

      <CodeBlock code={xhrExplanationCode} language="typescript" />

      <Callout variant="tip" title="HTTP/1.1 and HTTP/2">
        <p>
          Unlike <InlineCode>ReadableStream</InlineCode> with{" "}
          <InlineCode>duplex: &quot;half&quot;</InlineCode>, the XHR approach works on both HTTP/1.1
          and HTTP/2 with full browser support.
        </p>
      </Callout>

      <Prose>
        <h2 id="limitations">Limitations</h2>

        <p>
          When <InlineCode>onUploadProgress</InlineCode> is set, certain fetch-specific options are
          not available because the transport switches to XHR:
        </p>
      </Prose>

      <CodeBlock code={warningsCode} language="typescript" />

      <Callout variant="warning" title="Development warnings">
        <p>
          In development mode, Nexus logs a console warning for each ignored option so you can
          identify unintended usage early. In production, ignored options are silently skipped.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/encoding">Encoding</Link> — body and query serialization
            options
          </li>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — full proxy
            client API reference
          </li>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode Overview</Link> — architecture and
            security model
          </li>
        </ul>
      </Prose>
    </div>
  )
}
