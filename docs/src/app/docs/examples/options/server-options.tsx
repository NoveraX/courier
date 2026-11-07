"use client"

import { caller } from "@/lib/caller"
import { RequestInspector } from "@/site/inspector/request-inspector"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { useCall } from "./use-call"

export function ServerTimeoutDemo() {
  const late = useCall(() => caller.misc.slowRetried())
  return (
    <Sandbox
      label="caller.misc.slowRetried()"
      controls={
        <RunButton loading={late.loading} label="Fetch /slow on a timer" onClick={late.run} />
      }
      result={
        <ResponseView
          data={late.data}
          error={late.error}
          responseTime={late.elapsed}
          pending={late.loading}
        />
      }
      inspector={<RequestInspector calls={["api.misc.slowRetried"]} />}
    />
  )
}

export function RetryDemo() {
  const flaky = useCall(() => caller.misc.flaky({ code: 503 }))
  return (
    <Sandbox
      label="caller.misc.flaky({ code: 503 })"
      controls={<RunButton loading={flaky.loading} label="Fetch a 503" onClick={flaky.run} />}
      result={
        <ResponseView
          data={flaky.data}
          error={flaky.error}
          responseTime={flaky.elapsed}
          pending={flaky.loading}
        />
      }
      inspector={<RequestInspector calls={["api.misc.flaky"]} />}
    />
  )
}

export function CacheDemo() {
  const posts = useCall(() => caller.posts.cached())
  return (
    <Sandbox
      label="caller.posts.cached()"
      controls={
        <>
          <RunButton loading={posts.loading} label="Read the posts" onClick={posts.run} />
          <p className="m-0 text-[11.5px] leading-[1.5] text-fg-subtle">
            Read them twice: the second read, within 30 s of the first, is the cache&apos;s.
          </p>
        </>
      }
      result={
        <ResponseView
          data={posts.data}
          error={posts.error}
          responseTime={posts.elapsed}
          pending={posts.loading}
        />
      }
      inspector={<RequestInspector calls={["api.posts.cached"]} />}
    />
  )
}
