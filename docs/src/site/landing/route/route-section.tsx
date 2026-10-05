import { CodeLines } from "@/site/code/code-lines"
import { highlightTokens } from "@/site/code/highlight-tokens"
import { TransportDiagram } from "./transport-diagram"

const ROUTE_CODE = [
  "// app/api/request/route.ts",
  'import { apiRoute } from "@noverax/courier-next"',
  "",
  "export const { GET, POST } = apiRoute()",
].join("\n")

const ROUTE_DOES = [
  "Validates the request origin — CSRF handled for you",
  "Carries the headers and cookies you name to the backend, and back",
  "Routes to the right source, group and method",
  "Maps failures onto proper HTTP status codes",
  "Supports multipart uploads and custom encoding",
]

/**
 * The proxy route: one handler on your server for every endpoint, what it
 * takes care of, and where it sits between your clients and any backend.
 *
 * @returns The section
 * @example
 * ```tsx
 * <RouteSection />
 * ```
 */
export async function RouteSection() {
  const code = await highlightTokens(ROUTE_CODE, "ts")
  return (
    <section id="route" className="pt-26">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="grid grid-cols-1 items-center gap-8.5 rounded-[14px] border border-line bg-panel p-5.5 min-[600px]:p-8 min-[940px]:grid-cols-2">
          <div className="min-w-0">
            <h2 className="m-0 max-w-[16ch] animate-rise text-[clamp(25px,3vw,36px)] leading-[1.1] font-semibold tracking-[-0.03em]">
              One route. Every endpoint.
            </h2>
            <p className="mt-3.5 mb-5 max-w-[48ch] animate-rise text-[15.5px] leading-[1.6] text-fg-muted">
              Not a handler per endpoint — a single zero-argument handler that reads your registered
              sources and does the tedious parts for you.
            </p>
            <ul className="m-0 grid list-none gap-2.25 p-0">
              {ROUTE_DOES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-callout text-fg-muted">
                  <span aria-hidden="true" className="pt-0.5 text-[12px] text-ok">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-5 overflow-x-auto rounded-[10px] border border-line bg-bg-subtle">
              <CodeLines
                lines={code}
                className="m-0 px-4 py-3.5 text-label leading-[1.75] text-code-plain"
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="rounded-panel border border-line bg-bg-subtle p-5">
              <TransportDiagram />
              <p className="m-0 mt-4.5 border-t border-line pt-4 text-nav leading-[1.55] text-fg-muted">
                Your backend can be Express, FastAPI, Rails, Go or Laravel. Courier asks nothing of
                it — unlike tRPC, which requires the server to be yours.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
