import { Check } from "lucide-react"

import { cn } from "@/site/cn"
import type { CallProgress, ScriptCall } from "./session-script"
import type { ConfirmChoice } from "./terminal-script"

const ACCESS_TONE = { read: "text-tone-teal", destructive: "text-tone-red" } as const

/* `shop_orders_list` → `orders_list`: the client shows the server's name and the tool apart. */
function toolName(call: ScriptCall): string {
  return call.tool.replace(/^shop_/, "")
}

/* `{ shopper: "ada" }` → `shopper: "ada"`, as the call's arguments read in parentheses. */
function argsOf(call: ScriptCall): string {
  return call.args.replace(/^\{\s*|\s*\}$/g, "")
}

/**
 * A tool call as a terminal agent prints it: the server, the tool and its
 * arguments, and the tool's access.
 *
 * @param props - The call
 * @returns The line
 * @example
 * ```tsx
 * <ToolHeader call={SESSION_CALLS[0]} />
 * ```
 */
export function ToolHeader({ call }: { call: ScriptCall }) {
  return (
    <p className="m-0 flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 truncate">
        <span className="text-(--tone)">shop</span>
        <span className="text-fg-subtle"> › </span>
        <span className="font-semibold text-fg">{toolName(call)}</span>
        <span className="text-fg-subtle">({argsOf(call)})</span>
      </span>
      <span className={cn("ml-auto shrink-0 text-[10.5px]", ACCESS_TONE[call.access])}>
        {call.access}
      </span>
    </p>
  )
}

/**
 * What came of a tool call, under it: while the server runs it, a turning
 * spinner; once answered, the status, the time and what came back.
 *
 * @param props - The call, how far it has gone, and the spinner
 * @returns The line
 * @example
 * ```tsx
 * <ToolResult call={SESSION_CALLS[0]} progress="done" spinner="-" />
 * ```
 */
export function ToolResult({
  call,
  progress,
  spinner,
}: {
  call: ScriptCall
  progress: CallProgress
  spinner: string
}) {
  return (
    <p className="m-0 flex min-w-0 gap-2 pl-1">
      <span aria-hidden="true" className="text-fg-subtle">
        └
      </span>
      {progress === "done" ? (
        <span className="min-w-0 truncate">
          <span className="text-ok">{call.status}</span>
          <span className="text-fg-subtle"> · {call.ms} ms · </span>
          <span className="text-fg-muted">{call.result}</span>
        </span>
      ) : (
        <span className="text-fg-subtle">
          Running… <span className="text-(--tone)">{spinner}</span>
        </span>
      )}
    </p>
  )
}

/**
 * The question the MCP server puts to the person before a call that cannot
 * be undone, as the agent's terminal shows it: the call and its exact
 * arguments, the choice made with the keys — the safe one first — and,
 * once answered, one line saying so.
 *
 * @param props - The call it asks about, and where the answer stands
 * @returns The box, or the line once answered
 * @example
 * ```tsx
 * <ConfirmBox call={SESSION_CALLS[1]} choice="decline" />
 * ```
 */
export function ConfirmBox({ call, choice }: { call: ScriptCall; choice: ConfirmChoice }) {
  if (choice === "hidden") return null
  if (choice === "confirmed") {
    return (
      <p className="m-0 flex items-center gap-2 pl-1 text-fg-muted">
        <Check aria-hidden="true" className="size-3.25 text-ok" />
        You confirmed <span className="text-fg">{toolName(call)}</span>
      </p>
    )
  }
  const options = [
    { key: "confirm", label: "Confirm — run it" },
    { key: "decline", label: "Decline" },
  ] as const
  return (
    <div className="ml-1 rounded-[8px] border border-tone-red/45 px-3 py-2.5">
      <p className="m-0 text-tone-red">shop asks you to confirm</p>
      <p className="m-0 mt-1.5 text-fg">This cannot be undone.</p>
      <p className="m-0 text-fg-muted">
        {call.verb} {call.endpoint} {call.args}
      </p>
      <div className="mt-2 grid gap-0.5">
        {options.map((option) => (
          <p
            key={option.key}
            className={cn(
              "m-0 -mx-1.5 rounded-[4px] px-1.5",
              choice === option.key ? "bg-raised text-fg" : "text-fg-subtle"
            )}
          >
            <span aria-hidden="true" className="inline-block w-4 text-(--tone)">
              {choice === option.key ? "›" : ""}
            </span>
            {option.label}
          </p>
        ))}
      </div>
      <p className="m-0 mt-2 text-[10.5px] text-fg-subtle">↑↓ to choose · ⏎ to answer</p>
    </div>
  )
}

/**
 * The agent's input under the transcript: the prompt being typed, or an
 * empty line with the caret, and the hint beneath.
 *
 * @param props - The text in the input
 * @returns The input
 * @example
 * ```tsx
 * <PromptInput text="Cancel Ada's" />
 * ```
 */
export function PromptInput({ text }: { text: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-9 items-center gap-2 rounded-[8px] border border-line-strong px-3">
        <span aria-hidden="true" className="text-fg-subtle">
          &gt;
        </span>
        <span className="min-w-0 truncate text-fg">{text}</span>
        <span aria-hidden="true" className="-ml-1.5 inline-block h-4 w-2 animate-caret bg-fg/80" />
      </div>
      <p className="m-0 px-1 text-[10.5px] text-fg-subtle">? for shortcuts</p>
    </div>
  )
}
