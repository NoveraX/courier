import { Code2, Play } from "lucide-react"

import type { NavSection } from "./nav-types"

/** The reference sections: the API's functions, one page each, and the runnable examples. */
export const REFERENCE_SECTIONS: NavSection[] = [
  {
    label: "API Reference",
    icon: Code2,
    items: [
      { title: "defineApi", href: "/docs/api/define" },
      { title: "defineGroup / endpoint", href: "/docs/api/define-group" },
      { title: "defineMiddleware", href: "/docs/api/define-middleware" },
      { title: "createCaller", href: "/docs/api/create-caller" },
      { title: "createProxyCaller", href: "/docs/api/create-proxy-caller" },
      { title: "createQueryCaller", href: "/docs/api/create-query-caller" },
      { title: "createProxyQueryCaller", href: "/docs/api/create-proxy-query-caller" },
      { title: "createQueryKeys", href: "/docs/api/create-query-keys" },
      { title: "createTestClient", href: "/docs/api/create-test-client" },
      { title: "createHandler", href: "/docs/api/api-route" },
      { title: "HttpClient", href: "/docs/api/instance" },
      { title: "HTTPError", href: "/docs/api/http-error" },
      { title: "CallOptions", href: "/docs/api/call-options" },
      { title: "Types", href: "/docs/api/types" },
      { title: "courier.config.ts", href: "/docs/api/config" },
    ],
  },
  {
    label: "Examples",
    icon: Play,
    items: [
      { title: "Basic", href: "/docs/examples/basic", description: "Simple GET/POST requests" },
      { title: "CRUD", href: "/docs/examples/crud", description: "Create, read, update, delete" },
      {
        title: "Groups",
        href: "/docs/examples/groups",
        description: "Endpoint groups with prefix",
      },
      {
        title: "Path Params",
        href: "/docs/examples/path-params",
        description: "URL path parameters",
      },
      {
        title: "Encoding",
        href: "/docs/examples/encoding",
        description: "Custom body/search encoding",
      },
      { title: "Upload", href: "/docs/examples/upload", description: "FormData & file upload" },
      {
        title: "Direct",
        href: "/docs/examples/direct",
        description: "Server-side with createCaller",
      },
      {
        title: "Actions",
        href: "/docs/examples/actions",
        description: "Server Actions + direct mode",
      },
      {
        title: "Middleware",
        href: "/docs/examples/middleware",
        description: "Middleware chain",
      },
      { title: "Errors", href: "/docs/examples/errors", description: "HTTPError handling" },
      { title: "Abort", href: "/docs/examples/abort", description: "AbortController & dedup" },
      {
        title: "Streaming",
        href: "/docs/examples/streaming",
        description: "ReadableStream responses",
      },
      {
        title: "Raw Data",
        href: "/docs/examples/raw-data",
        description: "rawData: status + headers",
      },
      { title: "Options", href: "/docs/examples/options", description: "timeout, retry, cache" },
    ],
  },
]
