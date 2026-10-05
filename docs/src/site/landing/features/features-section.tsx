import { Activity, CloudUpload, GitMerge, Layers, ShieldCheck, TriangleAlert } from "lucide-react"

import { highlightTokens } from "@/site/code/highlight-tokens"
import { DedupeDiagram } from "./dedupe-diagram"
import { ErrorsDemo } from "./errors-demo"
import { FeatureCard } from "./feature-card"
import { FeatureClock } from "./feature-clock"
import { FEATURE_SNIPPETS } from "./feature-copy"
import { MiddlewareDemo } from "./middleware-demo"
import { StreamDemo } from "./stream-demo"
import { UploadDemo } from "./upload-demo"
import { ValidationDemo } from "./validation-demo"

/**
 * What Courier does on install, each running: upload progress, streaming,
 * shared reads, middleware, validation and errors — a card each, on one
 * clock that runs while they are on screen.
 *
 * @returns The section
 * @example
 * ```tsx
 * <FeaturesSection />
 * ```
 */
export async function FeaturesSection() {
  const [upload, stream, dedupe, middleware, validation, errors] = await Promise.all(
    [
      FEATURE_SNIPPETS.upload,
      FEATURE_SNIPPETS.stream,
      FEATURE_SNIPPETS.dedupe,
      FEATURE_SNIPPETS.middleware,
      FEATURE_SNIPPETS.validation,
      FEATURE_SNIPPETS.errors,
    ].map((code) => highlightTokens(code, "ts"))
  )
  return (
    <section id="features" className="pt-26">
      <div className="mx-auto max-w-[1200px] px-5">
        <h2 className="m-0 max-w-[20ch] animate-rise text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]">
          The parts everyone hand-rolls, built in
        </h2>
        <p className="mt-3.5 mb-8.5 max-w-[58ch] animate-rise text-[16px] leading-[1.6] text-fg-muted">
          Each one is shown running below. All of it ships with Courier — nothing to find, nothing
          to wire by hand.
        </p>
        <FeatureClock className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3">
          <FeatureCard
            tone="blue"
            icon={CloudUpload}
            eyebrow="UPLOADS"
            title="Upload progress that is actually real"
            text="In the browser it comes from XHR: onUploadProgress reports percent and bytes as they leave the machine — not a jump from 0 to 100."
            snippet={upload ?? []}
            span="two"
          >
            <UploadDemo />
          </FeatureCard>
          <FeatureCard
            tone="green"
            icon={Activity}
            eyebrow="STREAMING"
            title="Streams render as they arrive"
            text="One option turns the response into a stream. SSE and chunked bodies paint token by token."
            snippet={stream ?? []}
            span="one"
          >
            <StreamDemo />
          </FeatureCard>
          <FeatureCard
            tone="teal"
            icon={GitMerge}
            eyebrow="DEDUPLICATION"
            title="Identical reads collapse into one"
            text="Three components ask for the same user. One derived query key, one request."
            snippet={dedupe ?? []}
            span="one"
          >
            <DedupeDiagram />
          </FeatureCard>
          <FeatureCard
            tone="violet"
            icon={Layers}
            eyebrow="MIDDLEWARE"
            title="An onion you can actually read"
            text="Koa-style middleware wraps every call in both directions — logging, retry, auth, rate limits and caching compose in the order you list them."
            snippet={middleware ?? []}
            span="two"
          >
            <MiddlewareDemo />
          </FeatureCard>
          <FeatureCard
            tone="amber"
            icon={ShieldCheck}
            eyebrow="VALIDATION"
            title="Bad input never leaves"
            text="Pass a Zod, Valibot or ArkType schema to .variables(). Types are inferred from it and invalid data is stopped before the network."
            snippet={validation ?? []}
            span="one"
          >
            <ValidationDemo />
          </FeatureCard>
          <FeatureCard
            tone="red"
            icon={TriangleAlert}
            eyebrow="ERRORS"
            title="Errors you can narrow, not guess"
            text="Every non-2xx rejects with an HTTPError carrying status, headers and a typed body. The guard narrows unknown in a single line."
            snippet={errors ?? []}
            span="two-at-three"
          >
            <ErrorsDemo />
          </FeatureCard>
        </FeatureClock>
      </div>
    </section>
  )
}
