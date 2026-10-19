import type { DocMeta } from "@/site/content/doc-module"

/** Every examples page, by the last segment of its address: its title, what it shows and its mode. */
export const EXAMPLE_PAGES = {
  basic: {
    title: "Basic Requests",
    description: "Simple GET and POST requests using the proxy mode with React Query hooks.",
    mode: "proxy",
  },
  crud: {
    title: "CRUD Operations",
    description: "Full create, read, update, and delete cycle with useMutation and useQuery.",
    mode: "proxy",
  },
  groups: {
    title: "Request Groups",
    description: "Organize endpoints into groups with prefixes using defineGroup.",
    mode: "both",
  },
  "path-params": {
    title: "Path Parameters",
    description: "Dynamic URL segments with :param placeholders, auto-replaced from variables.",
    mode: "both",
  },
  encoding: {
    title: "Encoding",
    description: "Custom body and search params encoding with default values.",
    mode: "both",
  },
  upload: {
    title: "File Upload",
    description:
      "FormData file upload with progress tracking. Courier auto-detects FormData and handles encoding.",
    mode: "both",
  },
  direct: {
    title: "Direct Mode",
    description:
      "Server Components fetch data directly from the backend — no proxy, no API route, no client JS.",
    mode: "direct",
  },
  actions: {
    title: "Server Actions",
    description:
      "Mutate data with Server Actions + direct mode. The page revalidates automatically after each action.",
    mode: "direct",
  },
  middleware: {
    title: "Middleware",
    description: "Request middleware for logging, transformation, and error handling.",
    mode: "both",
  },
  errors: {
    title: "Error Handling",
    description: "HTTPError class, isHTTPError type guard, and global error callbacks.",
    mode: "both",
  },
  abort: {
    title: "Deduplication & Abort",
    description:
      "Identical reads in flight share one request, a newer call cancels the one it replaces, and any call can be aborted.",
    mode: "both",
  },
  streaming: {
    title: "Streaming",
    description:
      "Stream responses progressively with stream: true. Chunks arrive in real time via SSE.",
    mode: "both",
  },
  "raw-data": {
    title: "Raw Data Mode",
    description:
      "Access full response metadata through .raw — status code, headers, and data in one object.",
    mode: "both",
  },
  options: {
    title: "Request Options",
    description:
      "Configure timeout, retry, cache, and Next.js revalidation per request or globally.",
    mode: "both",
  },
  singleton: {
    title: "Typed Singleton",
    description:
      "Create a single typed request instance with full type inference across your entire application.",
    mode: "both",
  },
} as const satisfies Record<string, DocMeta>

/** An examples page, by the last segment of its address. */
export type ExampleName = keyof typeof EXAMPLE_PAGES
