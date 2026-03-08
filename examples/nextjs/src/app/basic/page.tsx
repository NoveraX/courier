"use client";

import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { RunButton } from "@/components/run-button";
import { useQuery, useMutation } from "@/lib/request";

const getCode = `import { useQuery } from "@/lib/request";

// useQuery fetches data automatically on mount
const { data, isLoading, error } = useQuery("mockApi", "users:getAll", {
  variables: {},
});`;

const postCode = `import { useMutation } from "@/lib/request";

const { mutate, data, isPending } = useMutation("mockApi", "users:create");

mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" });`;

const manualCode = `import { useMutation } from "@/lib/request";

// useMutation for on-demand calls — no need for manual useState
const { mutate, data, isPending } = useMutation("mockApi", "users:getById");

mutate({ id: 1 });`;

export default function BasicPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Basic Requests</h1>
        <p className="text-muted-foreground mt-1">
          Simple GET and POST requests using the proxy mode.
        </p>
      </div>

      <GetDemo />
      <PostDemo />
      <ManualDemo />
    </div>
  );
}

function GetDemo() {
  const { data, isLoading, error } = useQuery("mockApi", "users:getAll", { variables: {} });

  return (
    <DemoCard
      title="GET — Fetch Users"
      description="useQuery auto-fetches on mount. Data is cached and refetched by react-query."
      code={getCode}
    >
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <ResponseViewer error={error.message} /> : null}
      {data ? <ResponseViewer data={data} status={200} /> : null}
    </DemoCard>
  );
}

function PostDemo() {
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:create");

  return (
    <DemoCard
      title="POST — Create User"
      description="useMutation sends data on demand. Click Run to create a new user."
      code={postCode}
    >
      <RunButton
        loading={isPending}
        label="Create User"
        onClick={() => mutate({ name: "Jane Doe", email: "jane@example.com", role: "user" })}
      />
      {error ? <ResponseViewer error={error.message} /> : null}
      {data ? <ResponseViewer data={data} status={201} /> : null}
    </DemoCard>
  );
}

function ManualDemo() {
  const { mutate, data, isPending, error } = useMutation("mockApi", "users:getById");

  return (
    <DemoCard
      title="On-Demand — Imperative Fetch"
      description="useMutation works for any on-demand call, not just POST. Click to fetch user #1."
      code={manualCode}
    >
      <RunButton loading={isPending} label="Get User #1" onClick={() => mutate({ id: 1 })} />
      {error ? <ResponseViewer error={error.message} /> : null}
      {data ? <ResponseViewer data={data} status={200} /> : null}
    </DemoCard>
  );
}
