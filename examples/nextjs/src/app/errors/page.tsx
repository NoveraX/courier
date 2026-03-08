"use client";

import { useState } from "react";
import { isHTTPError } from "@noverax/nexus";
import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { RunButton } from "@/components/run-button";
import { request } from "@/lib/request";

const catchCode = `import { HTTPError } from "@noverax/nexus";

try {
  await request("mockApi")("misc:error", { code: 404 });
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.status);  // 404
    console.log(error.data);    // { success: false, message: "..." }
    console.log(error.headers); // Headers object
  }
}`;

const guardCode = `import { isHTTPError } from "@noverax/nexus";

try {
  await request("mockApi")("misc:error", { code: 403 });
} catch (error) {
  if (isHTTPError(error)) {
    // TypeScript knows: error.status, error.data, error.headers
    handleHttpError(error);
  } else {
    // Network error, timeout, etc.
    handleUnknownError(error);
  }
}`;

const globalCode = `import { createClientRequest } from "@noverax/nexus";

const request = createClientRequest({
  // Called for every failed request
  onError: (error) => {
    toast.error(\`Request failed: \${error.status}\`);

    if (error.status === 401) {
      router.push("/login");
    }
  },

  // Called for every successful request
  onSuccess: (data) => {
    console.log("Success:", data);
  },
});`;

const ERROR_CODES = [400, 401, 403, 404, 422, 500, 502, 503] as const;

export default function ErrorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Error Handling</h1>
        <p className="text-muted-foreground mt-1">
          HTTPError class, isHTTPError type guard, and global error callbacks.
        </p>
      </div>

      <CatchDemo />
      <GuardDemo />

      <DemoCard
        title="Global onError / onSuccess"
        description="Configure global callbacks for all requests in createClientRequest defaults."
        code={globalCode}
      >
        <p className="text-sm text-muted-foreground">
          Global callbacks fire for every request. Useful for toast notifications, auth redirects,
          and logging.
        </p>
      </DemoCard>
    </div>
  );
}

function CatchDemo() {
  const [selectedCode, setSelectedCode] = useState<number>(404);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    name: string;
    status: number;
    message: string;
    data: unknown;
  } | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await request("mockApi")("misc:error", { code: selectedCode });
    } catch (e: unknown) {
      if (isHTTPError(e)) {
        setError({
          name: e.name,
          status: e.status,
          message: e.message,
          data: e.data,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="HTTPError — Catch & Inspect"
      description="HTTPError provides status, data, and headers. Select an error code and trigger it."
      code={catchCode}
    >
      <div className="flex items-center gap-3">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={selectedCode}
          onChange={(e) => setSelectedCode(Number(e.target.value))}
        >
          {ERROR_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <RunButton
          loading={loading}
          label={`Trigger ${selectedCode}`}
          onClick={handleClick}
        />
      </div>
      {error ? <ResponseViewer data={error} status={error.status} /> : null}
    </DemoCard>
  );
}

function GuardDemo() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    isHttpError: boolean;
    status?: number;
    data?: unknown;
  } | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setResult(null);
    try {
      await request("mockApi")("misc:error", { code: 403 });
    } catch (error: unknown) {
      if (isHTTPError(error)) {
        setResult({
          isHttpError: true,
          status: error.status,
          data: error.data,
        });
      } else {
        setResult({ isHttpError: false });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="isHTTPError — Type Guard"
      description="Use isHTTPError() to narrow unknown errors. TypeScript infers status, data, and headers."
      code={guardCode}
    >
      <RunButton loading={loading} label="Trigger 403" onClick={handleClick} />
      {result ? <ResponseViewer data={result} status={result.status ?? 500} /> : null}
    </DemoCard>
  );
}
