"use client"

import {
  ArrowLeftRight,
  FileUp,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react"
import { motion } from "motion/react"

import { FeatureCard } from "@/components/docs/feature-card"

const features = [
  {
    icon: Sparkles,
    title: "Full Type Safety",
    description:
      "Response types, path params, and variables — all inferred from a single class definition.",
  },
  {
    icon: ArrowLeftRight,
    title: "Proxy & Direct",
    description:
      "Browser requests via API route proxy, server requests direct — identical API surface.",
  },
  {
    icon: RefreshCw,
    title: "React Query",
    description:
      "Built-in useQuery and useMutation wrappers with typed keys and automatic invalidation.",
  },
  {
    icon: FileUp,
    title: "File Uploads",
    description: "FormData with multipart encoding, XHR upload progress tracking out of the box.",
  },
  {
    icon: Radio,
    title: "Streaming",
    description:
      "ReadableStream and SSE support with progressive rendering in server and client.",
  },
  {
    icon: Shield,
    title: "Error Handling",
    description: "Typed HTTPError class, isHTTPError guard, and global onError lifecycle hooks.",
  },
  {
    icon: Layers,
    title: "Request Groups",
    description: "Organize endpoints into groups with shared prefixes and the group:method syntax.",
  },
  {
    icon: Lock,
    title: "Secure by Default",
    description:
      "Secrets stay server-side, CORS handled automatically, origin validation built in.",
  },
]

export function FeaturesGrid() {
  return (
    <section className="px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Everything You Need for{" "}
            <span className="gradient-brand-text">HTTP in Next.js</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            From simple GET requests to file uploads and streaming — one library covers it all.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} {...feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
