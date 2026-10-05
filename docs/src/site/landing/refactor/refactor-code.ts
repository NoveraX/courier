/** A line of the hand-written code, and the chunk of the refactor that deletes it. */
export interface OldLine {
  code: string
  /** 0 — the fetch, 1 — the proxy route, 2 — the query keys. */
  chunk: 0 | 1 | 2
}

/**
 * What one typed, proxied, cache-aware call costs by hand: the fetch, a
 * proxy route per endpoint, and query keys kept in sync.
 *
 * @example
 * ```ts
 * OLD_LINES.filter((l) => l.chunk === 0).length // 12
 * ```
 */
export const OLD_LINES: readonly OldLine[] = [
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the line is code shown as text
  { code: "const res = await fetch(`${process.env.NEXT_PUBLIC_API}/users/${id}`, {", chunk: 0 },
  { code: "  headers: {", chunk: 0 },
  { code: '    "Content-Type": "application/json",', chunk: 0 },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the line is code shown as text
  { code: "    Authorization: `Bearer ${token}`,", chunk: 0 },
  { code: "  },", chunk: 0 },
  { code: "  signal: controller.signal,", chunk: 0 },
  { code: "})", chunk: 0 },
  { code: "if (!res.ok) {", chunk: 0 },
  { code: "  const body = await res.text()", chunk: 0 },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the line is code shown as text
  { code: "  throw new Error(`${res.status}: ${body}`)", chunk: 0 },
  { code: "}", chunk: 0 },
  { code: "const user = (await res.json()) as User  // a hope, not a type", chunk: 0 },
  { code: "// app/api/users/[id]/route.ts — one per endpoint", chunk: 1 },
  { code: "export async function GET(req: Request) {", chunk: 1 },
  { code: "  // origin check, cookie forwarding, error mapping…", chunk: 1 },
  { code: "  // …and the same again for POST, PUT, DELETE", chunk: 1 },
  { code: "}", chunk: 1 },
  { code: "// lib/query-keys.ts — kept in sync by hand", chunk: 2 },
  { code: 'export const userKeys = { byId: (id) => ["users", id] }', chunk: 2 },
  { code: "const { data } = useQuery({ queryKey: userKeys.byId(id), queryFn })", chunk: 2 },
]

/**
 * What is left once Courier owns the call.
 *
 * @example
 * ```ts
 * NEW_LINES.length // 3
 * ```
 */
export const NEW_LINES: readonly string[] = [
  "const user = await caller.users.getById({ id })",
  "//    ^? User — typed end to end, abortable",
  'const { data } = q.users.useQuery("getById", { variables: { id } })',
]

/** The stretch of the scroll, 0 to 1, over which each chunk is struck. */
export const CHUNKS: readonly (readonly [number, number])[] = [
  [0.1, 0.38],
  [0.42, 0.56],
  [0.6, 0.7],
]

/** Where the new lines start to come in. */
export const NEW_FROM = 0.76

/**
 * The refactor's steps beside the code, with the lines each one takes away
 * or adds.
 *
 * @example
 * ```ts
 * REFACTOR_STEPS[3].delta // "+3"
 * ```
 */
export const REFACTOR_STEPS: readonly { title: string; sub: string; delta: string }[] = [
  { title: "Hand-rolled fetch", sub: "headers, error checks, a cast that lies", delta: "−12" },
  { title: "A proxy route per endpoint", sub: "origin, cookies, error mapping", delta: "−5" },
  {
    title: "Query keys kept in sync by hand",
    sub: "and the invalidation bugs that follow",
    delta: "−3",
  },
  {
    title: "Replaced by three typed lines",
    sub: "same behaviour, nothing to maintain",
    delta: "+3",
  },
]

/** The files the hand-written code lives in, one tab each. */
export const REFACTOR_TABS: readonly string[] = [
  "app/users/[id]/page.tsx",
  "api/users/[id]/route.ts",
  "lib/query-keys.ts",
]
