import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"
import { SINGLETON_SAMPLES } from "./singleton-samples"

export const metadata = docsMetadata(
  "Typed Singleton",
  "Create a single typed request instance with full type inference across your entire application."
)

export default function SingletonExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/singleton"
      title="Typed Singleton"
      description="Create a single typed request instance with full type inference across your entire application."
      mode="both"
    >
      <ExampleSection
        title="The Singleton Pattern"
        description="One createProxyQueryCaller call exports typed hooks for the entire app."
        code={SINGLETON_SAMPLES.singleton}
        learnMore={{ href: "/docs/advanced/singleton", label: "Singleton docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          The routes Studio writes from the endpoints you mark <code>.expose()</code> carry the
          API's group, endpoint, response and variable types. Every call site gets full
          autocompletion and type checking via dot-notation.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Source Definition"
        description="Define sources with defineApi and defineGroup functions. Export the sources map and its type."
        code={SINGLETON_SAMPLES.sources}
      >
        <p className="m-0 text-body text-fg-muted">
          The <code>typeof api</code> type is derived from the actual definitions — no need to
          manually define or sync types.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Method Types"
        description="The builder chain is the foundation of the type system."
        code={SINGLETON_SAMPLES.methodType}
      >
        <p className="m-0 text-body text-fg-muted">
          Each endpoint declares its response and variables types. These flow through the chain:
          courier → defineGroup → defineApi → courier.routes.ts → createProxyQueryCaller →
          q.group.useQuery.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Type Inference"
        description="Full autocompletion and type checking at every call site — no manual types needed."
        code={SINGLETON_SAMPLES.inference}
      >
        <p className="m-0 text-body text-fg-muted">
          TypeScript infers group names, endpoint names, response types, and variable types
          automatically via dot-notation. Errors are caught at compile time.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Multiple Instances"
        description="Create separate typed instances for different backends with independent defaults."
        code={SINGLETON_SAMPLES.multiInstance}
      >
        <p className="m-0 text-body text-fg-muted">
          Each instance has its own routes, defaults (timeout, headers, error handling), and is
          fully independent.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Direct Mode"
        description="createCaller uses the same type system for server-side usage."
        code={SINGLETON_SAMPLES.direct}
      >
        <p className="m-0 text-body text-fg-muted">
          Direct mode shares the same sources and type inference. Use it in Server Components and
          Server Actions without the proxy hop.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
