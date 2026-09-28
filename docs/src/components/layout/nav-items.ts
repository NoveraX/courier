import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Box,
  Cloud,
  Code2,
  Globe,
  Layers,
  Play,
  Puzzle,
  Rocket,
  Server,
  Settings,
  Shield,
  TestTube,
  Zap,
} from "lucide-react"

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
      { title: "What is Courier?", href: "/docs/introduction" },
      { title: "Why Courier?", href: "/docs/why-courier" },
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
      { title: "Defining APIs", href: "/docs/core-concepts/defining-apis" },
      { title: "Caller & Proxy", href: "/docs/core-concepts/caller" },
      { title: "Request Lifecycle", href: "/docs/core-concepts/request" },
      { title: "HTTP Client & Methods", href: "/docs/core-concepts/instance" },
      { title: "Type Safety", href: "/docs/core-concepts/type-safety" },
      { title: "Error Handling", href: "/docs/core-concepts/error-handling" },
    ],
  },
  {
    label: "Framework Guides",
    icon: Box,
    defaultOpen: true,
    items: [
      { title: "Next.js", href: "/docs/frameworks/nextjs" },
      { title: "Nuxt", href: "/docs/frameworks/nuxt" },
      { title: "React", href: "/docs/frameworks/react" },
      { title: "Vue", href: "/docs/frameworks/vue" },
      { title: "Hono", href: "/docs/frameworks/hono" },
      { title: "Express", href: "/docs/frameworks/express" },
      { title: "Fastify", href: "/docs/frameworks/fastify" },
      { title: "NestJS", href: "/docs/frameworks/nestjs" },
    ],
  },
  {
    label: "React Query",
    icon: Zap,
    items: [
      { title: "Setup", href: "/docs/react-query/setup" },
      { title: "useQuery", href: "/docs/react-query/use-query" },
      { title: "useMutation", href: "/docs/react-query/use-mutation" },
      { title: "Streams & Channels", href: "/docs/react-query/realtime" },
      { title: "Advanced Patterns", href: "/docs/react-query/advanced" },
    ],
  },
  {
    label: "Middleware",
    icon: Layers,
    items: [
      { title: "Overview", href: "/docs/middleware/overview" },
      { title: "Built-in Middleware", href: "/docs/middleware/built-in" },
      { title: "Custom Middleware", href: "/docs/middleware/custom" },
    ],
  },
  {
    label: "Validation",
    icon: Shield,
    items: [
      { title: "Standard Schema", href: "/docs/validation/standard-schema" },
      { title: "Zod Integration", href: "/docs/validation/zod" },
    ],
  },
  {
    label: "Proxy Mode",
    icon: Globe,
    items: [
      { title: "Overview", href: "/docs/proxy-mode/overview" },
      { title: "createProxyCaller", href: "/docs/proxy-mode/proxy-caller" },
      { title: "defineBoundary", href: "/docs/proxy-mode/boundary" },
      { title: "Server Handler", href: "/docs/proxy-mode/api-route" },
    ],
  },
  {
    label: "Server-Side",
    icon: Server,
    items: [
      { title: "Overview", href: "/docs/server-side/overview" },
      { title: "createCaller", href: "/docs/server-side/caller" },
      { title: "Server Actions", href: "/docs/server-side/actions" },
    ],
  },
  {
    label: "Advanced",
    icon: Settings,
    items: [
      { title: "Middleware", href: "/docs/advanced/middleware" },
      { title: "Streaming", href: "/docs/advanced/streaming" },
      { title: "Streams & Channels", href: "/docs/advanced/realtime" },
      { title: "Path Parameters", href: "/docs/advanced/path-params" },
      { title: "Encoding", href: "/docs/advanced/encoding" },
      { title: "File Upload", href: "/docs/advanced/upload" },
      { title: "Abort & Deduplication", href: "/docs/advanced/abort" },
      { title: "Raw Data Mode", href: "/docs/advanced/raw-data" },
      { title: "Options Reference", href: "/docs/advanced/options" },
      { title: "Singleton Pattern", href: "/docs/advanced/singleton" },
    ],
  },
  {
    label: "Testing",
    icon: TestTube,
    items: [
      { title: "Test Client", href: "/docs/testing/test-client" },
      { title: "Mocking Responses", href: "/docs/testing/mocking" },
    ],
  },
  {
    label: "Deployment",
    icon: Cloud,
    items: [
      { title: "Overview", href: "/docs/deployment/overview" },
      { title: "Standalone Server", href: "/docs/deployment/standalone-server" },
      { title: "Redis Adapters", href: "/docs/deployment/redis" },
      { title: "Replication Guide", href: "/docs/deployment/replication" },
      { title: "Docker", href: "/docs/deployment/docker" },
      { title: "Kubernetes", href: "/docs/deployment/kubernetes" },
      { title: "Cloudflare Workers", href: "/docs/deployment/cloudflare" },
    ],
  },
  {
    label: "API Reference",
    icon: Code2,
    items: [
      { title: "defineApi", href: "/docs/api/define" },
      { title: "defineGroup / endpoint", href: "/docs/api/define-group" },
      { title: "createCaller", href: "/docs/api/create-caller" },
      { title: "createProxyCaller", href: "/docs/api/create-proxy-caller" },
      { title: "createQueryCaller", href: "/docs/api/create-query-caller" },
      { title: "createProxyQueryCaller", href: "/docs/api/create-proxy-query-caller" },
      { title: "createHandler", href: "/docs/api/api-route" },
      { title: "HttpClient", href: "/docs/api/instance" },
      { title: "HTTPError", href: "/docs/api/http-error" },
      { title: "Types", href: "/docs/api/types" },
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
