import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { StepList } from "@/components/docs/step-list"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const problemCode = `import { createClientRequest } from "@noverax/nexus"
import { createDirectRequest } from "@noverax/nexus/direct"
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api"

// You have to pass the Sources generic everywhere:
const request = createClientRequest<Sources>()
const directRequest = createDirectRequest<Sources>(sources)
const { useQuery, useMutation } = createQueryRequest<Sources>()`

const step1Code = `// api/users.ts
import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string; email: string }

export class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Method<User[]> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
  create: Method<User, { name: string; email: string }> = ({ post }) => post()
}

// api/index.ts
import { Request } from "@noverax/nexus/RequestClass"
import { Users } from "./users"

const groups = { users: new Users() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
    })
  }
}

export const sources = { myApi: new MyApi() }`

const step2Code = `// types/nexus.d.ts
import type { sources } from "@/api"

declare module "@noverax/nexus" {
  interface Sources {
    myApi: (typeof sources)["myApi"]
  }
}`

const step3Code = `import { createClientRequest } from "@noverax/nexus"
import { createDirectRequest } from "@noverax/nexus/direct"
import { createQueryRequest } from "@noverax/nexus/query"
import { sources } from "@/api"

// No generic parameter needed — TypeScript infers from module augmentation
const request = createClientRequest()
const directRequest = createDirectRequest(sources)
const { useQuery, useMutation } = createQueryRequest()

// Full autocomplete: source names, group:method queries, variable types
useQuery("myApi", "users:getById", { variables: { id: 1 } })
//        ^-- autocomplete          ^-- autocomplete     ^-- typed`

const queryExampleCode = `"use client"

import { useQuery, useMutation } from "@/lib/request"

export function UserList() {
  // TypeScript knows "myApi" is a valid source,
  // "users:getAll" is a valid query,
  // and data is User[]
  const { data } = useQuery("myApi", "users:getAll")

  const { mutate } = useMutation("myApi", "users:create", {
    onSuccess: (user) => {
      // user is typed as User — no generic needed
      console.log(user.name)
    },
  })

  return (
    <div>
      {data?.map((user) => <p key={user.id}>{user.name}</p>)}
      <button onClick={() => mutate({ name: "Jane", email: "jane@test.com" })}>
        Add User
      </button>
    </div>
  )
}`

const multiSourceCode = `// types/nexus.d.ts
import type { sources } from "@/api"

declare module "@noverax/nexus" {
  interface Sources {
    mainApi: (typeof sources)["mainApi"]
    paymentApi: (typeof sources)["paymentApi"]
  }
}

// Now both sources are available without generics:
useQuery("mainApi", "users:getAll")       // ← knows mainApi groups
useQuery("paymentApi", "products:list")   // ← knows paymentApi groups`

export const metadata = docsMetadata(
  "Singleton Pattern",
  "Use TypeScript module augmentation to eliminate generic parameters from every request call."
)

export default async function SingletonPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Singleton Pattern"
        description="Use TypeScript module augmentation to eliminate generic parameters from every request call."
      />

      <Prose>
        <h2 id="the-problem">The problem</h2>

        <p>
          Without the singleton pattern, you need to pass the <InlineCode>Sources</InlineCode>{" "}
          generic type parameter to every factory function. This is repetitive and creates multiple
          places to update when sources change:
        </p>
      </Prose>

      <CodeBlock code={problemCode} filename="lib/request.ts" />

      <Prose>
        <h2 id="the-solution">The solution</h2>

        <p>
          TypeScript module augmentation lets you declare your sources once, and every Nexus factory
          function infers them automatically. No generic parameters needed.
        </p>
      </Prose>

      <Prose>
        <h2 id="setup">Step-by-step setup</h2>
      </Prose>

      <StepList
        steps={[
          {
            title: "Define your Request classes and sources",
            content: (
              <div className="mt-4 space-y-3">
                <p>
                  Create your groups and sources as usual. Export the{" "}
                  <InlineCode>sources</InlineCode> object so the type declaration can reference it:
                </p>
                <CodeBlock code={step1Code} filename="api/index.ts" />
              </div>
            ),
          },
          {
            title: "Augment the module",
            content: (
              <div className="mt-4 space-y-3">
                <p>
                  Create a <InlineCode>.d.ts</InlineCode> file that extends the Nexus{" "}
                  <InlineCode>Sources</InlineCode> interface. Each key in the interface must match a
                  key in your <InlineCode>sources</InlineCode> object:
                </p>
                <CodeBlock code={step2Code} filename="types/nexus.d.ts" />
                <Callout variant="tip" title="File location">
                  <p>
                    You can put this declaration anywhere TypeScript can see it — a dedicated{" "}
                    <InlineCode>types/</InlineCode> directory, alongside your source definitions, or
                    in a global <InlineCode>declarations.d.ts</InlineCode>. Just make sure it&apos;s
                    included in your <InlineCode>tsconfig.json</InlineCode>.
                  </p>
                </Callout>
              </div>
            ),
          },
          {
            title: "Use without generics",
            content: (
              <div className="mt-4 space-y-3">
                <p>
                  Now all factory functions infer your sources from the augmented interface.
                  TypeScript provides full autocomplete for source names, query strings, and
                  variable types:
                </p>
                <CodeBlock code={step3Code} filename="lib/request.ts" />
              </div>
            ),
          },
        ]}
      />

      <Prose>
        <h2 id="react-query">Using with React Query</h2>

        <p>
          The singleton pattern is especially useful with{" "}
          <InlineCode>createQueryRequest</InlineCode>, where you call{" "}
          <InlineCode>useQuery</InlineCode> and <InlineCode>useMutation</InlineCode> throughout your
          app. Every call site gets full type inference without importing or passing types:
        </p>
      </Prose>

      <CodeBlock code={queryExampleCode} filename="components/user-list.tsx" />

      <Prose>
        <h2 id="multiple-sources">Multiple sources</h2>

        <p>
          If your app connects to multiple backends, add each source to the augmented interface.
          TypeScript enforces correct group names for each source:
        </p>
      </Prose>

      <CodeBlock code={multiSourceCode} filename="types/nexus.d.ts" />

      <Callout variant="info" title="Single source of truth">
        <p>
          The <InlineCode>Sources</InlineCode> interface is the single source of truth for your API
          types. When you add a new source or group, update the augmentation and every{" "}
          <InlineCode>useQuery</InlineCode> / <InlineCode>request</InlineCode> call in your app gets
          autocomplete for the new methods immediately.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/project-setup">Project Setup</Link> — recommended file structure
            including type declarations
          </li>
          <li>
            <Link href="/docs/advanced/options">Options</Link> — source-level and per-request
            configuration
          </li>
          <li>
            <Link href="/singleton">Singleton Example</Link> — interactive demo of module
            augmentation
          </li>
        </ul>
      </Prose>
    </div>
  )
}
