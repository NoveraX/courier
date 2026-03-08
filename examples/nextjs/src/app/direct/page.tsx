import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { directRequest } from "@/lib/direct-request";

const fetchAllCode = `import { directRequest } from "@/lib/direct-request";

// Server Component — runs on the server, zero client JS
const users = await directRequest("mockApi")("users:getAll", {});`;

const fetchOneCode = `// Path params work identically to proxy mode
const user = await directRequest("mockApi")("users:getById", { id: 1 });`;

const fetchPostsCode = `// Access any request group — same API as proxy mode
const posts = await directRequest("mockApi")("posts:getAll", {});`;

const setupCode = `// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct";
import { methods } from "@/api";

export const directRequest = createDirectRequest(methods);`;

export default async function DirectPage() {
  const users = await directRequest("mockApi")("users:getAll", {});
  const user = await directRequest("mockApi")("users:getById", { id: 1 });
  const posts = await directRequest("mockApi")("posts:getAll", {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Direct Mode</h1>
        <p className="text-muted-foreground mt-1">
          Server Components fetch data directly from the backend — no proxy, no API route, no client JS.
        </p>
      </div>

      <DemoCard
        title="Setup"
        description="createDirectRequest uses the same source definitions as proxy mode. One line to set up."
        code={setupCode}
      >
        <p className="text-sm text-muted-foreground">
          Direct mode calls the backend directly from the server. No <code>/api/request</code> proxy
          hop — requests go straight to the backend URL defined in your Request class.
        </p>
      </DemoCard>

      <DemoCard
        title="Fetch Users (RSC)"
        description="Data is fetched during server rendering. The response is streamed as HTML — zero client-side fetch."
        code={fetchAllCode}
      >
        <ResponseViewer data={users} status={200} />
      </DemoCard>

      <DemoCard
        title="Single User"
        description="Path parameters like :id are replaced automatically from the variables object."
        code={fetchOneCode}
      >
        <ResponseViewer data={user} status={200} />
      </DemoCard>

      <DemoCard
        title="Fetch Posts"
        description="Access any request group the same way. The API surface is identical to proxy mode."
        code={fetchPostsCode}
      >
        <ResponseViewer data={posts} status={200} />
      </DemoCard>
    </div>
  );
}
