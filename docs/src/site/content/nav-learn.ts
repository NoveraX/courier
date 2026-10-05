import { BookOpen, Box, Layers, Puzzle, Rocket, Shield, Zap } from "lucide-react"

import type { NavSection } from "./nav-types"

/** The sections that teach Courier: what it is, how to start, its concepts, the framework guides, React Query, middleware and validation. */
export const LEARN_SECTIONS: NavSection[] = [
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
      { title: "Overview", href: "/docs/frameworks/overview" },
      { title: "Next.js", href: "/docs/frameworks/nextjs" },
      { title: "Nuxt", href: "/docs/frameworks/nuxt" },
      { title: "React", href: "/docs/frameworks/react" },
      { title: "Vue", href: "/docs/frameworks/vue" },
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
]
