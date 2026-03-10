import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  GitBranch,
  Layers,
  BarChart3,
  Network,
  Play,
  ShieldCheck,
  Code,
  GitCompare,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useSocketConnection } from "./socket";
import { useDevToolsStore, type RequestEntry, type Tab, type Theme } from "./store";

// ── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: Tab; icon: typeof Activity; label: string }[] = [
  { id: "timeline", icon: Activity, label: "Timeline" },
  { id: "waterfall", icon: GitBranch, label: "Waterfall" },
  { id: "middleware", icon: Layers, label: "Middleware" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
  { id: "explorer", icon: Network, label: "API Explorer" },
  { id: "playground", icon: Play, label: "Playground" },
  { id: "audit", icon: ShieldCheck, label: "Audit" },
  { id: "codegen", icon: Code, label: "Codegen" },
  { id: "compare", icon: GitCompare, label: "Compare" },
  { id: "settings", icon: Settings, label: "Settings" },
];

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_CYCLE: Theme[] = ["dark", "light", "system"];

// ── App ─────────────────────────────────────────────────────────────────────

export function App() {
  useSocketConnection();

  const { activeTab, setActiveTab, theme, setTheme, connected, sessions, requests, paused } =
    useDevToolsStore();

  const nextTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
  };

  const ThemeIcon = THEME_ICONS[theme];
  const errorCount = requests.filter((r) => r.status === "error").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
      <div className="flex flex-1 overflow-hidden">
        {/* ── Icon Sidebar ── */}
        <nav className="flex w-12 shrink-0 flex-col items-center border-r border-border-default bg-surface-0 py-2">
          {/* Logo */}
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
            <span className="text-sm font-bold text-indigo-400">N</span>
          </div>

          {/* Tab icons */}
          <div className="flex flex-1 flex-col items-center gap-0.5">
            {TABS.map(({ id, icon: Icon, label }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setActiveTab(id)}
                  className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:bg-surface-1 hover:text-text-secondary"
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            title={`Theme: ${theme}`}
            onClick={nextTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-1 hover:text-text-secondary transition-colors"
          >
            <ThemeIcon size={16} />
          </button>
        </nav>

        {/* ── Main Content ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "timeline" ? (
            <TimelineView />
          ) : (
            <PlaceholderView tab={activeTab} />
          )}
        </main>
      </div>

      {/* ── Bottom Status Bar ── */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border-default bg-surface-0 px-3 text-[11px]">
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-600"}`}
            />
            <span className="text-text-muted">
              {connected
                ? sessions.length > 0
                  ? `${sessions.length} app${sessions.length > 1 ? "s" : ""} connected`
                  : "Connected, waiting for apps"
                : "Disconnected"}
            </span>
          </div>

          {/* Recording indicator */}
          {paused && <span className="text-amber-400">Paused</span>}
        </div>

        <div className="flex items-center gap-3">
          {/* Request stats */}
          <span className="text-text-muted">{requests.length} requests</span>

          {/* Error count */}
          {errorCount > 0 && (
            <span className="text-red-400">{errorCount} error{errorCount > 1 ? "s" : ""}</span>
          )}

          {/* Pending count */}
          {pendingCount > 0 && (
            <span className="text-sky-400">{pendingCount} pending</span>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Timeline View ───────────────────────────────────────────────────────────

function TimelineView() {
  const { requests, selectedRequestId, selectRequest, togglePaused, paused, clearRequests, connected } =
    useDevToolsStore();

  const selectedRequest = requests.find((r) => r.id === selectedRequestId);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Request list */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border-default">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-3">
          <span className="text-xs text-text-muted">{requests.length} requests</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePaused}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                paused
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-surface-2 text-text-secondary hover:text-text-primary"
              }`}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={clearRequests}
              className="rounded bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* List with virtual scrolling */}
        <div className="flex-1 overflow-hidden">
          {requests.length === 0 ? (
            <EmptyState connected={connected} />
          ) : (
            <VirtualRequestList
              requests={requests}
              selectedId={selectedRequestId}
              onSelect={selectRequest}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedRequest && (
        <DetailPanel request={selectedRequest} onClose={() => selectRequest(null)} />
      )}
    </div>
  );
}

// ── Virtual Request List ────────────────────────────────────────────────────

function VirtualRequestList({
  requests,
  selectedId,
  onSelect,
}: {
  requests: RequestEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const request = requests[virtualItem.index]!;
          return (
            <div
              key={virtualItem.key}
              className="absolute left-0 w-full"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <RequestRow
                request={request}
                selected={request.id === selectedId}
                onSelect={() => onSelect(request.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Placeholder View ────────────────────────────────────────────────────────

function PlaceholderView({ tab }: { tab: Tab }) {
  const tabInfo = TABS.find((t) => t.id === tab);
  if (!tabInfo) return null;
  const Icon = tabInfo.icon;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
      <Icon size={40} strokeWidth={1} />
      <p className="text-sm font-medium text-text-secondary">{tabInfo.label}</p>
      <p className="text-xs">Coming soon</p>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
      <Activity size={32} strokeWidth={1} />
      <p className="text-sm">
        {connected ? "Waiting for requests..." : "Connecting to server..."}
      </p>
      {connected && (
        <p className="max-w-xs text-center text-xs">
          Call <code className="rounded bg-surface-2 px-1.5 py-0.5 text-text-secondary">connectDevTools()</code> in
          your app to start streaming events.
        </p>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-text-muted",
  success: "text-emerald-400",
  error: "text-red-400",
};

const STATUS_ICON: Record<string, string> = {
  pending: "\u25CC",
  success: "\u25CF",
  error: "\u2715",
};

const CODE_COLORS: Record<string, string> = {
  "2": "text-emerald-400",
  "3": "text-amber-400",
  "4": "text-red-400",
  "5": "text-red-500",
};

function RequestRow({
  request,
  selected,
  onSelect,
}: {
  request: RequestEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = [request.source, request.group, request.method].filter(Boolean).join(".");
  const codeColor = request.statusCode
    ? CODE_COLORS[String(request.statusCode)[0]!] ?? "text-text-secondary"
    : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full items-center gap-3 px-3 text-left text-sm transition-colors ${
        selected ? "bg-surface-2" : "hover:bg-surface-1"
      }`}
    >
      {/* Status icon */}
      <span className={`w-3 text-center text-xs ${STATUS_COLORS[request.status]}`}>
        {STATUS_ICON[request.status]}
      </span>

      {/* Mode badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
          request.mode === "proxy"
            ? "bg-violet-500/15 text-violet-400"
            : "bg-sky-500/15 text-sky-400"
        }`}
      >
        {request.mode}
      </span>

      {/* Endpoint path */}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
        {label}
      </span>

      {/* Status code */}
      {request.statusCode && (
        <span className={`text-xs font-medium tabular-nums ${codeColor}`}>
          {request.statusCode}
        </span>
      )}

      {/* Duration */}
      {request.timing && (
        <span
          className={`text-xs tabular-nums ${
            request.timing.total > 500
              ? "text-red-400"
              : request.timing.total > 100
                ? "text-amber-400"
                : "text-emerald-400"
          }`}
        >
          {Math.round(request.timing.total)}ms
        </span>
      )}
    </button>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  request,
  onClose,
}: {
  request: RequestEntry;
  onClose: () => void;
}) {
  const label = [request.source, request.group, request.method].filter(Boolean).join(".");

  return (
    <div className="flex w-[420px] shrink-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border-subtle px-3">
        <span className="truncate font-mono text-xs text-text-secondary">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-sm transition-colors"
        >
          \u2715
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-4">
        {/* General */}
        <Section title="General">
          <Row label="Source" value={request.source} />
          {request.group && <Row label="Group" value={request.group} />}
          <Row label="Method" value={request.method} />
          <Row label="Mode" value={request.mode} />
          <Row label="Status" value={request.status} />
          {request.statusCode !== undefined && (
            <Row label="Status Code" value={String(request.statusCode)} />
          )}
          {request.middlewareCount > 0 && (
            <Row label="Middleware" value={String(request.middlewareCount)} />
          )}
        </Section>

        {/* Timing */}
        {request.timing && (
          <Section title="Timing">
            <TimingBar timing={request.timing} />
            <Row label="Total" value={`${Math.round(request.timing.total)}ms`} />
            {request.timing.middleware > 0 && (
              <Row label="Middleware" value={`${Math.round(request.timing.middleware)}ms`} />
            )}
            {request.timing.fetch > 0 && (
              <Row label="Fetch" value={`${Math.round(request.timing.fetch)}ms`} />
            )}
            {request.timing.validation > 0 && (
              <Row label="Validation" value={`${Math.round(request.timing.validation)}ms`} />
            )}
          </Section>
        )}

        {/* Variables */}
        {request.variables !== undefined && (
          <Section title="Variables">
            <JsonBlock data={request.variables} />
          </Section>
        )}

        {/* Response */}
        {request.data !== undefined && (
          <Section title="Response Data">
            <JsonBlock data={request.data} />
          </Section>
        )}

        {/* Headers */}
        {request.headers && Object.keys(request.headers).length > 0 && (
          <Section title="Response Headers">
            {Object.entries(request.headers).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </Section>
        )}

        {/* Error */}
        {request.error && (
          <Section title="Error">
            <Row label="Type" value={request.error.type} />
            <Row label="Message" value={request.error.message} />
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Timing Bar ──────────────────────────────────────────────────────────────

function TimingBar({ timing }: { timing: RequestEntry["timing"] }) {
  if (!timing || timing.total === 0) return null;

  const segments = [
    { label: "Middleware", value: timing.middleware, color: "bg-violet-500" },
    { label: "Fetch", value: timing.fetch, color: "bg-sky-500" },
    { label: "Validation", value: timing.validation, color: "bg-amber-500" },
  ].filter((s) => s.value > 0);

  return (
    <div className="mb-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} opacity-80`}
            style={{ width: `${(seg.value / timing.total) * 100}%` }}
            title={`${seg.label}: ${Math.round(seg.value)}ms`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${seg.color}`} />
            <span className="text-[10px] text-text-muted">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Utility Components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="truncate text-text-secondary">{value}</span>
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded bg-surface-1 p-2 text-[11px] text-text-muted">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
