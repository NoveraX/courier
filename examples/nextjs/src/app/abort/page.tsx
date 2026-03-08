"use client";

import { useRef, useState } from "react";
import { isHTTPError } from "@noverax/nexus";
import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { RunButton } from "@/components/run-button";
import { request } from "@/lib/request";

const manualAbortCode = `const controller = new AbortController();

// Pass signal to cancel the request at any time
const promise = request("mockApi", { signal: controller.signal })(
  "misc:slow"
);

// Cancel the request
controller.abort();`;

const dedupCode = `const abortRef = useRef<AbortController | null>(null);

function handleClick() {
  // Abort the previous in-flight request
  abortRef.current?.abort();

  const controller = new AbortController();
  abortRef.current = controller;

  request("mockApi", { signal: controller.signal })(
    "users:getAll", {}
  );
}`;

const requestAbortCode = `import { Request } from "@noverax/nexus/RequestClass";

// requestAbort: true enables automatic deduplication
// at the Instance level — if the same path+method is called
// again while a request is in-flight, the old one is aborted
// with a 499 status code.

class Api extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups,
      requestAbort: true,
    });
  }
}`;

export default function AbortPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abort & Deduplication</h1>
        <p className="text-muted-foreground mt-1">
          Cancel in-flight requests with AbortController and deduplicate rapid calls.
        </p>
      </div>

      <ManualAbortDemo />
      <DedupDemo />

      <DemoCard
        title="requestAbort — Instance-Level Dedup"
        description="Source-level config that auto-aborts duplicate requests by path+method. Used in direct mode or persistent Instance scenarios."
        code={requestAbortCode}
      >
        <p className="text-sm text-muted-foreground">
          When <code className="text-xs bg-muted px-1 py-0.5 rounded">requestAbort: true</code> is
          set, the Instance tracks in-flight requests by path and method. If a duplicate is fired,
          the previous one is aborted with status 499.
        </p>
      </DemoCard>
    </div>
  );
}

function ManualAbortDemo() {
  const controllerRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "aborted" | "error"; data: unknown } | null>(null);

  const handleStart = async () => {
    setLoading(true);
    setResult(null);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await request("mockApi", { signal: controller.signal })("misc:slow");
      setResult({ type: "success", data });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setResult({ type: "aborted", data: { message: "Request was aborted by user" } });
      } else if (isHTTPError(error)) {
        setResult({ type: "error", data: { status: error.status, message: error.message } });
      } else {
        setResult({ type: "aborted", data: { message: "Request cancelled" } });
      }
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
  };

  return (
    <DemoCard
      title="Manual Abort"
      description="Start a slow request (3s delay) and cancel it before it completes."
      code={manualAbortCode}
    >
      <div className="flex items-center gap-3">
        <RunButton loading={loading} label="Start Slow Request" onClick={handleStart} />
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          disabled={!loading}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
      {result ? (
        <ResponseViewer
          data={result.data}
          status={result.type === "success" ? 200 : result.type === "aborted" ? 499 : 500}
        />
      ) : null}
    </DemoCard>
  );
}

function DedupDemo() {
  const abortRef = useRef<AbortController | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [abortedCount, setAbortedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleClick = async () => {
    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
      setAbortedCount((c) => c + 1);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setClickCount((c) => c + 1);
    setLoading(true);
    setResult(null);

    try {
      const data = await request("mockApi", { signal: controller.signal })("users:getAll", {});
      setResult(data);
    } catch {
      // Aborted — ignore
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setClickCount(0);
    setAbortedCount(0);
    setLoading(false);
    setResult(null);
  };

  return (
    <DemoCard
      title="Request Deduplication"
      description="Click the button rapidly — each click aborts the previous in-flight request. Only the last request completes."
      code={dedupCode}
    >
      <div className="flex items-center gap-3">
        <RunButton loading={loading} label="Fetch Users" onClick={handleClick} />
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Clicks: {clickCount}</span>
        <span>Aborted: {abortedCount}</span>
      </div>
      {result ? <ResponseViewer data={result} status={200} /> : null}
    </DemoCard>
  );
}
