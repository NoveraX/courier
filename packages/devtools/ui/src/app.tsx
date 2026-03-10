import { useSocketConnection } from "./socket";
import { useDevToolsStore, type RequestEntry } from "./store";

export function App() {
  useSocketConnection();

  const { connected, sessions, requests, selectedRequestId, selectRequest, togglePaused, paused, clearRequests } =
    useDevToolsStore();

  const selectedRequest = requests.find((r) => r.id === selectedRequestId);

  return (
    <div className="flex h-screen flex-col">
      {/* ── Header ───────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-wide text-zinc-300">
            Nexus DevTools
          </span>
          <ConnectionBadge connected={connected} sessionCount={sessions.length} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={togglePaused}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              paused
                ? "bg-amber-500/20 text-amber-400"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {paused ? "Paused" : "Recording"}
          </button>
          <button
            onClick={clearRequests}
            className="rounded px-2.5 py-1 text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            Clear
          </button>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Request list */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-zinc-800">
          {/* Toolbar */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800/60 px-3">
            <span className="text-xs text-zinc-500">{requests.length} requests</span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {requests.length === 0 ? (
              <EmptyState connected={connected} />
            ) : (
              requests.map((req) => (
                <RequestRow
                  key={req.id}
                  request={req}
                  selected={req.id === selectedRequestId}
                  onSelect={() => selectRequest(req.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedRequest && (
          <DetailPanel
            request={selectedRequest}
            onClose={() => selectRequest(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function ConnectionBadge({ connected, sessionCount }: { connected: boolean; sessionCount: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-600"}`}
      />
      <span className="text-xs text-zinc-500">
        {connected
          ? sessionCount > 0
            ? `${sessionCount} app${sessionCount > 1 ? "s" : ""}`
            : "No apps"
          : "Disconnected"}
      </span>
    </div>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
      <p className="text-sm">
        {connected ? "Waiting for requests..." : "Connecting to server..."}
      </p>
      {connected && (
        <p className="max-w-xs text-center text-xs text-zinc-700">
          Call <code className="text-zinc-500">connectDevTools()</code> in your app to start
          streaming events.
        </p>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-500",
  success: "text-emerald-400",
  error: "text-red-400",
};

const STATUS_ICON: Record<string, string> = {
  pending: "◌",
  success: "●",
  error: "✕",
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
    ? CODE_COLORS[String(request.statusCode)[0]!] ?? "text-zinc-400"
    : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
        selected ? "bg-zinc-800/80" : "hover:bg-zinc-900"
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
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
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
      <div className="flex h-9 items-center justify-between border-b border-zinc-800/60 px-3">
        <span className="truncate font-mono text-xs text-zinc-300">{label}</span>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 text-sm"
        >
          ✕
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="truncate text-zinc-300">{value}</span>
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded bg-zinc-900 p-2 text-[11px] text-zinc-400">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
