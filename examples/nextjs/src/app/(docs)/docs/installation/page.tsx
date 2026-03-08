import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { CodeGroup } from "@/components/docs/code-group"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const tsconfigCode = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}`

const envCode = `# Your backend API URL (server-side only)
API_URL=http://localhost:4000

# Optional: custom proxy route path (default: "request")
# NEXT_PUBLIC_REQUEST_PAGE=api/my-request`

export const metadata = docsMetadata("Installation", "Add @noverax/nexus to your Next.js project in under a minute.")

export default async function InstallationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Installation"
        description="Add @noverax/nexus to your Next.js project in under a minute."
      />

      <Prose>
        <h2 id="install-package">Install the package</h2>

        <p>Install Nexus with your preferred package manager:</p>
      </Prose>

      <CodeGroup
        items={[
          { label: "npm", code: "npm install @noverax/nexus", language: "bash" },
          { label: "pnpm", code: "pnpm add @noverax/nexus", language: "bash" },
          { label: "yarn", code: "yarn add @noverax/nexus", language: "bash" },
          { label: "bun", code: "bun add @noverax/nexus", language: "bash" },
        ]}
      />

      <Prose>
        <h2 id="peer-dependencies">Peer dependencies</h2>

        <p>
          Nexus requires <InlineCode>next</InlineCode> (≥14) and <InlineCode>react</InlineCode>{" "}
          (≥18) as peer dependencies. If you&apos;re using React Query integration, you also need{" "}
          <InlineCode>@tanstack/react-query</InlineCode> (≥5):
        </p>
      </Prose>

      <CodeGroup
        items={[
          {
            label: "npm",
            code: "npm install @tanstack/react-query",
            language: "bash",
          },
          {
            label: "pnpm",
            code: "pnpm add @tanstack/react-query",
            language: "bash",
          },
          {
            label: "yarn",
            code: "yarn add @tanstack/react-query",
            language: "bash",
          },
          {
            label: "bun",
            code: "bun add @tanstack/react-query",
            language: "bash",
          },
        ]}
      />

      <Callout variant="info" title="Optional peer dependencies">
        <p>
          <InlineCode>next</InlineCode> and <InlineCode>@tanstack/react-query</InlineCode> are
          optional — you only need them if you use the corresponding features. The core{" "}
          <InlineCode>Request</InlineCode> / <InlineCode>RequestGroup</InlineCode> classes and
          direct mode work without Next.js.
        </p>
      </Callout>

      <Prose>
        <h2 id="typescript">TypeScript configuration</h2>

        <p>
          Nexus is written in TypeScript and ships type declarations. Ensure your{" "}
          <InlineCode>tsconfig.json</InlineCode> has strict mode enabled for the best type
          inference:
        </p>
      </Prose>

      <CodeBlock code={tsconfigCode} language="json" filename="tsconfig.json" />

      <Callout variant="tip" title="Path aliases">
        <p>
          The examples in this documentation use the <InlineCode>@/*</InlineCode> path alias. This
          is configured by default in Next.js projects created with{" "}
          <InlineCode>create-next-app</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="environment-variables">Environment variables</h2>

        <p>
          Add your backend API URL as an environment variable. This is used server-side only and is
          never exposed to the browser:
        </p>
      </Prose>

      <CodeBlock code={envCode} language="bash" filename=".env.local" />

      <Prose>
        <p>
          The <InlineCode>API_URL</InlineCode> variable is read in your source definitions (the{" "}
          <InlineCode>Request</InlineCode> class constructor). In proxy mode, requests are routed
          through your Next.js API route, so the backend URL stays on the server.
        </p>

        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/quick-start">Quick Start</Link> — define your first API source and
            make a request
          </li>
          <li>
            <Link href="/docs/project-setup">Project Setup</Link> — recommended file structure for
            production apps
          </li>
        </ul>
      </Prose>
    </div>
  )
}
