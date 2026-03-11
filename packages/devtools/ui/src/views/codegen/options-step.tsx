import { Code, Loader2, Check } from "lucide-react"

import type { GenerateOptions } from "./types"

// ── Local sub-components ────────────────────────────────────────────────────

function RadioGroup({ label, value, items, onChange }: {
  label: string
  value: string
  items: { id: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              value === item.id
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "bg-surface-1 text-text-muted border border-border-subtle hover:text-text-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
          checked
            ? "border-indigo-500 bg-indigo-500 text-white"
            : "border-border-default bg-surface-0"
        }`}
      >
        {checked && <Check size={10} />}
      </button>
      <span className="text-xs text-text-secondary">{label}</span>
    </label>
  )
}

// ── Options Step ────────────────────────────────────────────────────────────

export function OptionsStep({
  options,
  loading,
  onOptionsChange,
  onGenerate,
}: {
  options: GenerateOptions
  loading: boolean
  onOptionsChange: (o: GenerateOptions) => void
  onGenerate: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Generation Options</h2>
          <p className="text-xs text-text-muted">Configure how the Nexus code is generated.</p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Code size={14} />}
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      <div className="space-y-5 rounded-lg border border-border-default p-4">
        <RadioGroup
          label="Validation Library"
          value={options.validation}
          items={[
            { id: "zod", label: "Zod" },
            { id: "valibot", label: "Valibot" },
            { id: "arktype", label: "ArkType" },
            { id: "none", label: "None (types only)" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, validation: v as GenerateOptions["validation"] })}
        />

        <RadioGroup
          label="Group By"
          value={options.groupBy}
          items={[
            { id: "tag", label: "OpenAPI Tag" },
            { id: "path", label: "Path Prefix" },
            { id: "single", label: "Single Group" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, groupBy: v as GenerateOptions["groupBy"] })}
        />

        <RadioGroup
          label="Naming Convention"
          value={options.naming}
          items={[
            { id: "camelCase", label: "camelCase" },
            { id: "as-is", label: "As-is from spec" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, naming: v as GenerateOptions["naming"] })}
        />

        <RadioGroup
          label="Client File"
          value={options.generateClient}
          items={[
            { id: "both", label: "Direct + Proxy" },
            { id: "direct", label: "Direct only" },
            { id: "proxy", label: "Proxy only" },
            { id: "none", label: "None" },
          ]}
          onChange={(v) => onOptionsChange({ ...options, generateClient: v as GenerateOptions["generateClient"] })}
        />

        <div className="space-y-2.5 border-t border-border-subtle pt-4">
          <Toggle label="Generate TypeScript types" checked={options.generateTypes} onChange={(v) => onOptionsChange({ ...options, generateTypes: v })} />
          <Toggle label="Generate validation schemas" checked={options.generateSchemas} onChange={(v) => onOptionsChange({ ...options, generateSchemas: v })} />
          <Toggle label="Add auth middleware to secured endpoints" checked={options.addAuthMiddleware} onChange={(v) => onOptionsChange({ ...options, addAuthMiddleware: v })} />
          <Toggle label="Include JSDoc comments from spec descriptions" checked={options.includeComments} onChange={(v) => onOptionsChange({ ...options, includeComments: v })} />
        </div>
      </div>
    </div>
  )
}
