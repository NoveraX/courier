"use client"

import { motion } from "motion/react"

import { cn } from "@/lib/utils"

function Node({
  label,
  sub,
  className,
  delay = 0,
}: {
  label: string
  sub: string
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "relative z-10 flex flex-col items-center gap-1 rounded-xl border px-6 py-4 text-center shadow-sm",
        className
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </motion.div>
  )
}

function Arrow({ delay = 0, label }: { delay?: number; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      whileInView={{ opacity: 1, scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay }}
      className="flex flex-col items-center gap-1"
    >
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <div className="flex h-px w-12 items-center bg-border sm:w-20">
        <div className="ml-auto h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-brand" />
      </div>
    </motion.div>
  )
}

export function Architecture() {
  return (
    <section className="px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Two Modes, <span className="gradient-brand-text">One API</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Choose proxy mode for the browser or direct mode for the server — same interface, same
            types.
          </p>
        </motion.div>

        <div className="mt-12 space-y-8">
          {/* Proxy mode */}
          <div className="rounded-xl border bg-card/50 p-6">
            <span className="mb-4 inline-block rounded-md bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
              Proxy Mode
            </span>
            <div className="flex items-center justify-center gap-2 overflow-x-auto sm:gap-4">
              <Node
                label="Browser"
                sub="Client Component"
                className="bg-surface"
                delay={0.1}
              />
              <Arrow delay={0.2} label="POST" />
              <Node
                label="Next.js"
                sub="API Route"
                className="border-brand/30 bg-brand/5"
                delay={0.3}
              />
              <Arrow delay={0.4} label="Proxy" />
              <Node label="Backend" sub="REST API" className="bg-surface" delay={0.5} />
            </div>
          </div>

          {/* Direct mode */}
          <div className="rounded-xl border bg-card/50 p-6">
            <span className="mb-4 inline-block rounded-md bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              Direct Mode
            </span>
            <div className="flex items-center justify-center gap-2 overflow-x-auto sm:gap-4">
              <Node
                label="Server"
                sub="RSC / Actions"
                className="border-success/30 bg-success/5"
                delay={0.1}
              />
              <Arrow delay={0.2} label="Direct" />
              <Node label="Backend" sub="REST API" className="bg-surface" delay={0.3} />
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No proxy hop — server components call the backend directly
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
