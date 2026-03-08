import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface Step {
  title: string
  content: ReactNode
}

interface StepListProps {
  steps: Step[]
  className?: string
}

export function StepList({ steps, className }: StepListProps) {
  return (
    <div data-slot="step-list" className={cn("space-y-8", className)}>
      {steps.map((step, index) => (
        <div key={step.title} className="relative pl-10">
          {/* Connector line */}
          {index < steps.length - 1 && (
            <div className="absolute left-[15px] top-9 h-[calc(100%+1rem)] w-px bg-border" />
          )}
          {/* Step number */}
          <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-brand bg-background text-sm font-bold text-brand">
            {index + 1}
          </div>
          {/* Content */}
          <div>
            <h4 className="text-base font-semibold leading-8">{step.title}</h4>
            <div className="mt-2 text-sm text-muted-foreground">{step.content}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
