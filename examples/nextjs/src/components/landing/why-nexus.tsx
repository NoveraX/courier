"use client"

import { Box, Code, Rocket, Server } from "lucide-react"
import { motion } from "motion/react"

import { IconBadge } from "@/components/docs/icon-badge"

const cards = [
  {
    icon: Code,
    title: "Zero Boilerplate",
    description:
      "Define your API once as a class — get typed methods, path params, and request groups for free.",
    variant: "brand" as const,
  },
  {
    icon: Server,
    title: "Two Modes, One API",
    description:
      "Proxy mode for the browser, direct mode for the server. Same interface, same types, different transports.",
    variant: "info" as const,
  },
  {
    icon: Rocket,
    title: "Built for Next.js",
    description:
      "App Router, React Server Components, Server Actions — all first-class. Not an afterthought.",
    variant: "success" as const,
  },
  {
    icon: Box,
    title: "Production Ready",
    description:
      "Error handling, abort/dedup, streaming, upload progress, hooks — battle-tested features out of the box.",
    variant: "warning" as const,
  },
]

export function WhyNexus() {
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
            Why <span className="gradient-brand-text">Nexus</span>?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built from the ground up for the way modern Next.js apps consume APIs.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-xl border bg-card p-6 transition-colors hover:border-brand/20"
            >
              <IconBadge icon={card.icon} variant={card.variant} size="lg" className="mb-4" />
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {card.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
