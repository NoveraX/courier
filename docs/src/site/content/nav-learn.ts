import type { NavSection } from "./nav-types"

/** The sections that teach Courier: what it is, how to start, its concepts, the framework guides, React Query, middleware and validation. */
export const LEARN_SECTIONS: NavSection[] = [
  {
    id: "introduction",
    label: "Introduction",
    defaultOpen: true,
    items: [
      { title: "What is Courier?", href: "/docs/introduction" },
      { title: "Why Courier?", href: "/docs/why-courier" },
      { title: "Architecture", href: "/docs/architecture" },
    ],
  },
  {
    id: "getting-started",
    label: "Getting Started",
    defaultOpen: true,
    items: [
      { title: "Installation", href: "/docs/installation" },
      { title: "Quick Start", href: "/docs/quick-start" },
      { title: "Create Courier", href: "/docs/create-courier" },
      { title: "Create Courier Reference", href: "/docs/create-courier-reference" },
      { title: "Project Setup", href: "/docs/project-setup" },
      { title: "How Courier Reads Your Project", href: "/docs/reading-your-project" },
      { title: "Upgrading from 0.4", href: "/docs/upgrading" },
    ],
  },
  {
    id: "core-concepts",
    label: "Core Concepts",
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
    id: "frameworks",
    label: "Framework Guides",
    defaultOpen: true,
    items: [
      { title: "Overview", href: "/docs/frameworks/overview" },
      { title: "Next.js", href: "/docs/frameworks/nextjs" },
      { title: "Nuxt", href: "/docs/frameworks/nuxt" },
      { title: "React", href: "/docs/frameworks/react" },
      { title: "Vue", href: "/docs/frameworks/vue" },
      { title: "React Native", href: "/docs/frameworks/react-native" },
      { title: "Hono", href: "/docs/frameworks/hono" },
      { title: "Express", href: "/docs/frameworks/express" },
      { title: "Fastify", href: "/docs/frameworks/fastify" },
      { title: "NestJS", href: "/docs/frameworks/nestjs" },
      { title: "Astro", href: "/docs/frameworks/astro" },
      { title: "Remix & React Router", href: "/docs/frameworks/remix" },
      { title: "SolidStart", href: "/docs/frameworks/solid-start" },
      { title: "SvelteKit", href: "/docs/frameworks/sveltekit" },
    ],
  },
  {
    id: "react-query",
    label: "React Query",
    items: [
      { title: "Setup", href: "/docs/react-query/setup" },
      { title: "useQuery", href: "/docs/react-query/use-query" },
      { title: "useMutation", href: "/docs/react-query/use-mutation" },
      { title: "Streams & Channels", href: "/docs/react-query/realtime" },
      { title: "Advanced Patterns", href: "/docs/react-query/advanced" },
    ],
  },
  {
    id: "middleware",
    label: "Middleware",
    items: [
      { title: "Overview", href: "/docs/middleware/overview" },
      { title: "Built-in Middleware", href: "/docs/middleware/built-in" },
      { title: "Custom Middleware", href: "/docs/middleware/custom" },
    ],
  },
  {
    id: "validation",
    label: "Validation",
    items: [
      { title: "Standard Schema", href: "/docs/validation/standard-schema" },
      { title: "Zod Integration", href: "/docs/validation/zod" },
    ],
  },
]
