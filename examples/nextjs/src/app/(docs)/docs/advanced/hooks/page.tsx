import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const hookTypesCode = `type HookInfo = {
  source: string
  group?: string
  query: string
  variables?: unknown
}

type BaseOptions = {
  // Called before the request is executed
  onRequest?: (info: HookInfo) => HookInfo | undefined | Promise<HookInfo | undefined>

  // Called after a successful response
  onResponse?: (
    info: HookInfo,
    response: { status: number; data: unknown }
  ) => { status: number; data: unknown } | undefined | Promise<...>

  // Called when a request fails (catch-safe)
  onError?: (info: HookInfo, error: HTTPError) => undefined | Promise<undefined>
}`

const loggingCode = `// api/sources.ts
class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      onRequest(info) {
        console.log(\`[\${info.source}] \${info.group}:\${info.query}\`, info.variables)
        return undefined // don't modify the request
      },
      onResponse(info, response) {
        console.log(\`[\${info.source}] \${info.group}:\${info.query} → \${response.status}\`)
        return undefined // don't modify the response
      },
      onError(info, error) {
        console.error(\`[\${info.source}] \${info.group}:\${info.query} failed:\`, error.message)
      },
    })
  }
}`

const unwrapCode = `// Many APIs wrap responses in a { data } envelope:
// GET /users → { data: [{ id: 1, name: "Jane" }], meta: { total: 42 } }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      onResponse(_info, response) {
        // Unwrap the envelope — components receive the inner data directly
        if (response.data && typeof response.data === "object" && "data" in response.data) {
          return { status: response.status, data: response.data.data }
        }
        return undefined
      },
    })
  }
}`

const sentryCode = `import * as Sentry from "@sentry/nextjs"

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      onError(info, error) {
        Sentry.captureException(error, {
          tags: {
            source: info.source,
            group: info.group,
            query: info.query,
          },
          extra: { variables: info.variables },
        })
        // onError is catch-safe — if Sentry throws, it won't crash your app
      },
    })
  }
}`

const authCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      onRequest(info) {
        // Inject an auth token into variables for server-side requests
        const token = getAuthToken()
        return {
          ...info,
          variables: { ...info.variables, _authToken: token },
        }
      },
    })
  }
}`

export const metadata = docsMetadata("Hooks (Lifecycle)", "Intercept, transform, and observe every request with onRequest, onResponse, and onError hooks.")

export default async function HooksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Hooks (Lifecycle)"
        description="Intercept, transform, and observe every request with onRequest, onResponse, and onError hooks."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Nexus provides three lifecycle hooks that let you intercept requests at different stages.
          Hooks are defined in <InlineCode>BaseOptions</InlineCode> when creating a{" "}
          <InlineCode>Request</InlineCode> class, so they apply to every method in that source.
        </p>

        <p>The execution order is:</p>

        <ol>
          <li>
            <InlineCode>onRequest</InlineCode> — runs before the HTTP call. Can modify the request
            info.
          </li>
          <li>The HTTP method executes.</li>
          <li>
            On success: <InlineCode>onResponse</InlineCode> — can transform the response data or
            status.
          </li>
          <li>
            On failure: <InlineCode>onError</InlineCode> — for logging and monitoring. Cannot
            recover the request.
          </li>
        </ol>
      </Prose>

      <Prose>
        <h2 id="hook-types">Hook signatures</h2>

        <p>
          All hooks receive a <InlineCode>HookInfo</InlineCode> object identifying the request. The
          return value determines whether the hook modifies anything:
        </p>

        <ul>
          <li>Return a modified object to apply changes.</li>
          <li>
            Return <InlineCode>undefined</InlineCode> to skip (no changes).
          </li>
        </ul>
      </Prose>

      <CodeBlock code={hookTypesCode} filename="types" />

      <Prose>
        <h2 id="on-request">onRequest</h2>

        <p>
          Runs before the HTTP call. Receives <InlineCode>HookInfo</InlineCode> and can return a
          modified copy to change the source, group, query, or variables. Return{" "}
          <InlineCode>undefined</InlineCode> to proceed without changes.
        </p>

        <p>
          Use cases: injecting auth tokens, redirecting to a different method, adding default
          variables, request logging.
        </p>
      </Prose>

      <CodeBlock code={authCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="on-response">onResponse</h2>

        <p>
          Runs after a successful response. Receives <InlineCode>HookInfo</InlineCode> and the{" "}
          <InlineCode>{"{ status, data }"}</InlineCode> object. Return a modified response to
          transform the data, or <InlineCode>undefined</InlineCode> to pass it through unchanged.
        </p>

        <p>A common pattern is unwrapping API envelopes so your components receive clean data:</p>
      </Prose>

      <CodeBlock code={unwrapCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="on-error">onError</h2>

        <p>
          Runs when a request fails with an <InlineCode>HTTPError</InlineCode>. This hook is{" "}
          <strong>catch-safe</strong> — if your error handler itself throws, the exception is
          silently caught and does not propagate. This makes it safe for logging and analytics
          integrations.
        </p>
      </Prose>

      <CodeBlock code={sentryCode} filename="api/sources.ts" />

      <Callout variant="warning" title="onError cannot recover requests">
        <p>
          The <InlineCode>onError</InlineCode> hook is for observation only. You cannot retry or
          recover the request from this hook. Use <InlineCode>retry</InlineCode> in{" "}
          <Link href="/docs/advanced/options">Options</Link> for automatic retries.
        </p>
      </Callout>

      <Prose>
        <h2 id="logging-example">Full logging example</h2>

        <p>Combine all three hooks to create a complete request logging pipeline:</p>
      </Prose>

      <CodeBlock code={loggingCode} filename="api/sources.ts" />

      <Callout variant="tip" title="Hooks are async-compatible">
        <p>
          All hooks can be <InlineCode>async</InlineCode> functions. Nexus awaits the return value
          before proceeding to the next stage.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/options">Options</Link> — full reference of source-level and
            per-request options
          </li>
          <li>
            <Link href="/docs/advanced/abort">Abort & Deduplication</Link> — automatic request
            deduplication with abort signals
          </li>
          <li>
            <Link href="/hooks">Hooks Example</Link> — interactive demo of all three hooks
          </li>
        </ul>
      </Prose>
    </div>
  )
}
