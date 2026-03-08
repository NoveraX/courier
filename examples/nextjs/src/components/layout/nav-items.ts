import type { LucideIcon } from "lucide-react"
import { BookOpen, Code2, Layers, Play, Puzzle, Rocket, Server, Settings, Zap } from "lucide-react"

export type NavItem = {
  title: string
  href: string
  description?: string
  badge?: string
  disabled?: boolean
}

export type NavSection = {
  label: string
  icon: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
}

export const docsNav: NavSection[] = [
  {
    label: "Introduction",
    icon: BookOpen,
    defaultOpen: true,
    items: [
      { title: "What is Nexus?", href: "/docs/introduction" },
      { title: "Why Nexus?", href: "/docs/why-nexus" },
      { title: "Architecture", href: "/docs/architecture" },
    ],
  },
  {
    label: "Getting Started",
    icon: Rocket,
    defaultOpen: true,
    items: [
      { title: "Installation", href: "/docs/installation" },
      { title: "Quick Start", href: "/docs/quick-start" },
      { title: "Project Setup", href: "/docs/project-setup" },
    ],
  },
  {
    label: "Core Concepts",
    icon: Puzzle,
    items: [
      { title: "Request & RequestGroup", href: "/docs/core-concepts/request" },
      { title: "Instance & Methods", href: "/docs/core-concepts/instance" },
      { title: "Type Safety", href: "/docs/core-concepts/type-safety" },
      { title: "Error Handling", href: "/docs/core-concepts/error-handling" },
    ],
  },
  {
    label: "Proxy Mode",
    icon: Layers,
    items: [
      { title: "Overview", href: "/docs/proxy-mode/overview" },
      { title: "createClientRequest", href: "/docs/proxy-mode/client-request" },
      { title: "API Route Handler", href: "/docs/proxy-mode/api-route" },
      { title: "Path Parameters", href: "/docs/proxy-mode/path-params" },
      { title: "Encoding", href: "/docs/proxy-mode/encoding" },
      { title: "File Upload", href: "/docs/proxy-mode/upload" },
    ],
  },
  {
    label: "Server-Side",
    icon: Server,
    items: [
      { title: "Overview", href: "/docs/server-side/overview" },
      { title: "createDirectRequest", href: "/docs/server-side/direct" },
      { title: "Server Actions", href: "/docs/server-side/actions" },
    ],
  },
  {
    label: "React Query",
    icon: Zap,
    items: [
      { title: "Setup", href: "/docs/react-query/setup" },
      { title: "useQuery", href: "/docs/react-query/use-query" },
      { title: "useMutation", href: "/docs/react-query/use-mutation" },
      { title: "Advanced Patterns", href: "/docs/react-query/advanced" },
    ],
  },
  {
    label: "Advanced",
    icon: Settings,
    items: [
      { title: "Hooks (Lifecycle)", href: "/docs/advanced/hooks" },
      { title: "Streaming", href: "/docs/advanced/streaming" },
      { title: "Abort & Deduplication", href: "/docs/advanced/abort" },
      { title: "Raw Data Mode", href: "/docs/advanced/raw-data" },
      { title: "Options", href: "/docs/advanced/options" },
      { title: "Singleton Pattern", href: "/docs/advanced/singleton" },
    ],
  },
  {
    label: "API Reference",
    icon: Code2,
    items: [
      { title: "createClientRequest", href: "/docs/api/create-client-request" },
      { title: "createDirectRequest", href: "/docs/api/create-direct-request" },
      { title: "createQueryRequest", href: "/docs/api/create-query-request" },
      { title: "apiRoute", href: "/docs/api/api-route" },
      { title: "Request", href: "/docs/api/request" },
      { title: "RequestGroup", href: "/docs/api/request-group" },
      { title: "Instance", href: "/docs/api/instance" },
      { title: "HTTPError", href: "/docs/api/http-error" },
      { title: "Types", href: "/docs/api/types" },
    ],
  },
  {
    label: "Examples",
    icon: Play,
    defaultOpen: true,
    items: [
      { title: "Basic", href: "/docs/examples/basic", description: "Simple GET/POST requests" },
      { title: "CRUD", href: "/docs/examples/crud", description: "Create, read, update, delete" },
      { title: "Groups", href: "/docs/examples/groups", description: "RequestGroup with prefix" },
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
        description: "RSC with createDirectRequest",
      },
      {
        title: "Actions",
        href: "/docs/examples/actions",
        description: "Server Actions + direct mode",
      },
      {
        title: "Hooks",
        href: "/docs/examples/hooks",
        description: "onRequest / onResponse / onError",
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
      { title: "Singleton", href: "/docs/examples/singleton", description: "Module augmentation" },
    ],
  },
]

/** Flatten all enabled nav items in order (for pagination) */
export function flatNavItems(): NavItem[] {
  return docsNav.flatMap((section) => section.items.filter((item) => !item.disabled))
}

/** Find the section and item for a given pathname */
export function findNavContext(pathname: string) {
  for (const section of docsNav) {
    const item = section.items.find((i) => i.href === pathname)
    if (item) return { section, item }
  }
  return null
}
