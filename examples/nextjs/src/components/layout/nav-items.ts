export type NavItem = {
  title: string
  href: string
  description: string
}

export type NavCategory = {
  label: string
  items: NavItem[]
}

export const navCategories: NavCategory[] = [
  {
    label: "Getting Started",
    items: [
      { title: "Basic", href: "/basic", description: "Simple GET/POST requests" },
      { title: "CRUD", href: "/crud", description: "Create, read, update, delete" },
    ],
  },
  {
    label: "Proxy Mode",
    items: [
      { title: "Groups", href: "/groups", description: "RequestGroup with prefix" },
      { title: "Path Params", href: "/path-params", description: "URL path parameters" },
      { title: "Encoding", href: "/encoding", description: "Custom body/search encoding" },
      { title: "Upload", href: "/upload", description: "FormData & file upload" },
    ],
  },
  {
    label: "Server-Side",
    items: [
      { title: "Direct", href: "/direct", description: "RSC with createDirectRequest" },
      { title: "Actions", href: "/actions", description: "Server Actions + direct mode" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { title: "Hooks", href: "/hooks", description: "onRequest / onResponse / onError" },
      { title: "Errors", href: "/errors", description: "HTTPError handling" },
      { title: "Abort", href: "/abort", description: "AbortController & dedup" },
      { title: "Streaming", href: "/streaming", description: "ReadableStream responses" },
      { title: "Raw Data", href: "/raw-data", description: "rawData: status + headers" },
      { title: "Options", href: "/options", description: "timeout, retry, cache" },
      { title: "Singleton", href: "/singleton", description: "Module augmentation" },
    ],
  },
]
