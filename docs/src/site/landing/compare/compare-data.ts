import type { LucideIcon } from "lucide-react"
import {
  BadgeCheck,
  CloudUpload,
  DatabaseZap,
  FileCode,
  FlaskConical,
  Layers,
  Radio,
  RefreshCw,
  ScanSearch,
  Server,
  ShieldCheck,
  Workflow,
} from "lucide-react"

/** How well a tool covers a need: built in, partly or by hand, or not at all. */
export type Coverage = "yes" | "part" | "no"

/** A need, and how each tool meets it: fetch, axios, tRPC, Courier. */
export interface CompareRow {
  need: string
  icon: LucideIcon
  cells: readonly [Cell, Cell, Cell, Cell]
}

/** How one tool meets one need, in a word or two. */
export interface Cell {
  coverage: Coverage
  text: string
}

function cell(coverage: Coverage, text: string): Cell {
  return { coverage, text }
}

/** The tools compared, Courier last. */
export const COMPARED = ["fetch", "axios", "tRPC", "courier"] as const

/**
 * Where Courier sits among the usual ways to call an API. Each cell is
 * what the tool does out of the box today.
 *
 * @example
 * ```ts
 * COMPARE_ROWS[1].cells[2] // { coverage: "no", text: "tRPC server only" }
 * ```
 */
export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    need: "Type safety",
    icon: ShieldCheck,
    cells: [
      cell("no", "Manual casts"),
      cell("no", "Manual casts"),
      cell("yes", "Full"),
      cell("yes", "Full inference"),
    ],
  },
  {
    need: "Any REST backend",
    icon: Server,
    cells: [
      cell("yes", "Yes"),
      cell("yes", "Yes"),
      cell("no", "tRPC server only"),
      cell("yes", "Unchanged"),
    ],
  },
  {
    need: "No code generation",
    icon: FileCode,
    cells: [cell("yes", "None"), cell("yes", "None"), cell("yes", "None"), cell("yes", "None")],
  },
  {
    need: "React Query",
    icon: RefreshCw,
    cells: [
      cell("no", "Manual"),
      cell("no", "Manual"),
      cell("yes", "Built-in"),
      cell("yes", "Built-in"),
    ],
  },
  {
    need: "Server components",
    icon: Layers,
    cells: [
      cell("part", "Manual"),
      cell("part", "Manual"),
      cell("yes", "Server callers"),
      cell("yes", "First-class"),
    ],
  },
  {
    need: "Middleware",
    icon: Workflow,
    cells: [
      cell("no", "No"),
      cell("part", "Interceptors"),
      cell("yes", "Built-in"),
      cell("yes", "Koa-style chain"),
    ],
  },
  {
    need: "Runtime validation",
    icon: BadgeCheck,
    cells: [
      cell("no", "No"),
      cell("no", "No"),
      cell("yes", "Any validator"),
      cell("yes", "Any Standard Schema"),
    ],
  },
  {
    need: "Upload progress",
    icon: CloudUpload,
    cells: [cell("no", "No"), cell("yes", "Yes"), cell("no", "No"), cell("yes", "Built-in")],
  },
  {
    need: "Typed streams & sockets",
    icon: Radio,
    cells: [
      cell("no", "Manual"),
      cell("no", "No"),
      cell("yes", "Subscriptions"),
      cell("yes", "SSE and WebSocket"),
    ],
  },
  {
    need: "Retries & caching",
    icon: DatabaseZap,
    cells: [
      cell("no", "Manual"),
      cell("part", "Plugins"),
      cell("part", "Via React Query"),
      cell("yes", "Built-in"),
    ],
  },
  {
    need: "Mock server from the API",
    icon: FlaskConical,
    cells: [
      cell("no", "Separate tool"),
      cell("no", "Separate tool"),
      cell("no", "Separate tool"),
      cell("yes", "From the definition"),
    ],
  },
  {
    need: "Devtools for every call",
    icon: ScanSearch,
    cells: [
      cell("part", "Browser only"),
      cell("part", "Browser only"),
      cell("part", "Community tools"),
      cell("yes", "Courier Studio"),
    ],
  },
]

/**
 * How many needs a tool meets in full, of all of them.
 *
 * @param column - The tool's column, 0 to 3
 * @returns Its score, as "7 / 12"
 * @example
 * ```ts
 * scoreOf(3) // "12 / 12"
 * ```
 */
export function scoreOf(column: number): string {
  const met = COMPARE_ROWS.filter((row) => row.cells[column]?.coverage === "yes").length
  return `${met} / ${COMPARE_ROWS.length}`
}
