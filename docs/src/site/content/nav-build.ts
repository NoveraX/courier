import { Cloud, Globe, LockKeyhole, Monitor, Server, Settings, TestTube } from "lucide-react"

import type { NavSection } from "./nav-types"

/** The sections about building with Courier: proxy mode, server-side calls, the advanced topics, testing, Studio and deployment. */
export const BUILD_SECTIONS: NavSection[] = [
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
      { title: "User Sessions", href: "/docs/server-side/session" },
    ],
  },
  {
    label: "Security",
    icon: LockKeyhole,
    items: [{ title: "Security Model", href: "/docs/security/overview" }],
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
      { title: "OpenAPI Export", href: "/docs/advanced/openapi" },
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
      { title: "Mock Utilities", href: "/docs/testing/mock-utilities" },
    ],
  },
  {
    label: "Studio",
    icon: Monitor,
    items: [
      { title: "Studio", href: "/docs/studio/overview" },
      { title: "Import an API", href: "/docs/studio/import-api" },
      { title: "Mock Servers", href: "/docs/studio/mock-servers" },
      { title: "Network Conditions", href: "/docs/studio/network-conditions" },
      { title: "How Studio Loads the Project", href: "/docs/studio/project-loading" },
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
]
