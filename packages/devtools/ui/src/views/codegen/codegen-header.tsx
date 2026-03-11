import type { LucideIcon } from "lucide-react"
import { Code, Database, Eye, Save, Plus, Trash2, Wand2 } from "lucide-react"

import type { CodegenTab, Step, SourceConfig, SourceState } from "./types"

export function CodegenHeader({
  st,
  src,
  watching,
  sources,
  states,
  onToggleWatch,
  onSaveConfig,
  step,
  onStepChange,
  tab,
  onTabChange,
}: {
  st: SourceState
  src: SourceConfig
  watching: boolean
  sources: SourceConfig[]
  states: SourceState[]
  onToggleWatch: () => void
  onSaveConfig: () => void
  step: Step
  onStepChange: (s: Step) => void
  tab: CodegenTab
  onTabChange: (t: CodegenTab) => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-text-muted" />
          <span className="text-sm font-medium">Codegen</span>
        </div>
        <TabSwitcher tab={tab} onTabChange={onTabChange} />
        {tab === "wizard" && st.spec && (
          <span className="text-xs text-text-muted">{st.spec.title} v{st.spec.version}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {tab === "wizard" && (
          <WizardControls st={st} src={src} watching={watching} sources={sources} states={states} onToggleWatch={onToggleWatch} onSaveConfig={onSaveConfig} step={step} onStepChange={onStepChange} />
        )}
      </div>
    </div>
  )
}

function TabSwitcher({ tab, onTabChange }: { tab: CodegenTab; onTabChange: (t: CodegenTab) => void }) {
  return (
    <div className="flex items-center rounded-md bg-surface-1 p-0.5">
      <TabButton active={tab === "wizard"} onClick={() => onTabChange("wizard")} icon={Wand2} label="Wizard" />
      <TabButton active={tab === "registry"} onClick={() => onTabChange("registry")} icon={Database} label="Registry" />
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${active ? "bg-surface-2 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}>
      <Icon size={11} />
      {label}
    </button>
  )
}

function WizardControls({ st, src, watching, sources, states, onToggleWatch, onSaveConfig, step, onStepChange }: {
  st: SourceState; src: SourceConfig; watching: boolean; sources: SourceConfig[]; states: SourceState[]
  onToggleWatch: () => void; onSaveConfig: () => void; step: Step; onStepChange: (s: Step) => void
}) {
  return (
    <>
      {st.spec && src.importSource === "url" && (
        <button type="button" onClick={onToggleWatch} title={watching ? "Stop watching" : "Watch spec URL (10s)"} className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${watching ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "text-text-muted hover:text-text-secondary"}`}>
          <Eye size={12} className={watching ? "animate-pulse" : ""} />
          {watching ? "Watching" : "Watch"}
        </button>
      )}
      {sources.some((_, i) => states[i]?.spec) && (
        <button type="button" onClick={onSaveConfig} title="Save codegen config" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary">
          <Save size={12} /> Save Config
        </button>
      )}
      <div className="mx-1 h-4 w-px bg-border-subtle" />
      {(["import", "select", "options", "preview"] as Step[]).map((s, i) => (
        <button key={s} type="button" disabled={(s === "select" && !st.spec) || (s === "options" && !st.spec) || (s === "preview" && st.files.length === 0)} onClick={() => onStepChange(s)} className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${step === s ? "bg-indigo-500/15 text-indigo-400" : "text-text-muted hover:text-text-secondary disabled:opacity-30"}`}>
          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${step === s ? "bg-indigo-500 text-white" : "bg-surface-2 text-text-muted"}`}>{i + 1}</span>
          <span className="hidden sm:inline">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
        </button>
      ))}
    </>
  )
}

export function SourceTabs({
  sources,
  states,
  activeSourceIdx,
  onSwitch,
  onRemove,
  onAdd,
}: {
  sources: SourceConfig[]
  states: SourceState[]
  activeSourceIdx: number
  onSwitch: (idx: number) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border-default bg-surface-0 px-3 py-1.5">
      {sources.map((s, i) => (
        <button key={i} type="button" onClick={() => onSwitch(i)} className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${i === activeSourceIdx ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" : "text-text-muted hover:text-text-secondary border border-transparent hover:border-border-subtle"}`}>
          <span className="font-medium">{s.name}</span>
          {states[i]?.spec && <span className="text-[10px] text-text-muted">{states[i].spec!.groups.reduce((sum, g) => sum + g.endpoints.length, 0)}ep</span>}
          {sources.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(i) }} className="ml-0.5 hidden rounded p-0.5 text-text-muted hover:bg-red-500/15 hover:text-red-400 group-hover:block">
              <Trash2 size={10} />
            </button>
          )}
        </button>
      ))}
      <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary hover:bg-surface-1" title="Add API source">
        <Plus size={12} /> Add
      </button>
    </div>
  )
}
