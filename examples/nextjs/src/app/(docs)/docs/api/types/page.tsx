import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const commonRequestCode = `type CommonRequest<T extends Record<string, any>, D extends boolean = false> = <
  K extends keyof T,
  RD extends boolean = false,
>(
  source: K,
  options?: MethodsInstanceOptions<RD>,
) => <
  Q extends MethodGroup<T[K]>,
  M extends MethodSource<T[K], Q>,
  R = MethodQueryResponse<M extends Method<any, any> ? M : unknown>,
>(
  ...arguments_: RequestArguments<Q, M, D>
) => MethodRequestResponse<RD, R>

// D = false → Proxy mode → returns Promise<R>
// D = true  → Direct mode → returns Promise<Partial<MethodKyResponse<R>>>`

const methodCode = `type Method<R, V = undefined> = (
  methods: Methods,
  variables: V,
) => MethodKyResponse<R> | Promise<MethodKyResponse<R>>

// R = response type
// V = variables type (undefined if no variables needed)

// Usage in source definition:
type UserMethods = {
  getAll: Method<User[]>                    // no variables
  getById: Method<User, { id: string }>     // requires { id: string }
  create: Method<User, CreateUserInput>     // requires CreateUserInput
}`

const methodsCode = `// HTTP method names — matches ky methods, with "del" instead of "delete"
type Methods = "get" | "post" | "put" | "patch" | "del" | "head"`

const methodsInstanceCode = `type MethodsInstance = {
  [K in Methods]: <T = unknown>(
    ...arguments_: MethodParameters<K>
  ) => Promise<MethodKyResponse<T>>
}

// The object your method definitions receive as the first argument`

const methodKyResponseCode = `type MethodKyResponse<T = unknown> = {
  status: number    // HTTP status code (e.g., 200, 404)
  headers: Headers  // Response headers
  data: T           // Parsed response body
}`

const methodParametersCode = `// Parameters for HTTP methods
type MethodParameters<T extends Methods> = T extends "head"
  ? [url?: string, options?: MethodOptions<T>]
  : [url?: string, variables?: Record<string, unknown>, options?: MethodOptions<T>]

// Head has no body/variables, other methods accept variables`

const methodOptionsCode = `// Per-call options (subset of ky Options)
type MethodOptions<T extends Methods> = T extends "delete" | "get" | "head"
  ? SimpleOptions
  : OptionsWithSearchParams

type SimpleOptions = Omit<OptionsWithSearchParams, "body" | "json" | "searchParams">

type OptionsWithSearchParams = Omit<Options, "searchParams"> & {
  searchParams?: Record<string, unknown>
}`

const methodsInstanceOptionsCode = `type MethodsInstanceOptions<R extends boolean = false> = Omit<
  SimpleOptions,
  "onUploadProgress"
> & {
  rawData?: R           // Return { status, headers, data } instead of just data
  passVars?: boolean    // Pass variables to methodsInstance (default: true)
  stream?: boolean      // Return ReadableStream response
  onUploadProgress?: (progress: UploadProgress) => void  // XHR upload progress
}`

const uploadProgressCode = `type UploadProgress = {
  percent: number           // 0 to 1
  transferredBytes: number  // Bytes transferred so far
  totalBytes: number        // Total bytes to transfer
}`

const baseOptionsCode = `type BaseOptions = MergeOptions &
  Omit<Options, "body" | "json" | "prefixUrl" | "searchParams"> & {
    baseURL?: string
    responseType?: ResponseType
    defaultData?: Record<string, unknown>
    defaultQueryParams?: Record<string, unknown>
    extraHeaders?: string[]
    bodyEncoder?: (object: Record<string, unknown>) => BodyInit
    searchParamsEncoder?: (object: Record<string, unknown>) => SearchParamsOption
    searchParamsParse?: (string: string) => Record<string, unknown>
    requestAbort?: boolean
    onRequest?: (info: HookInfo) => HookInfo | undefined | Promise<HookInfo | undefined>
    onResponse?: (
      info: HookInfo,
      response: { status: number; data: unknown },
    ) => { status: number; data: unknown } | undefined | Promise<...>
    onError?: (info: HookInfo, error: HTTPError) => undefined | Promise<undefined>
  }`

const responseTypeCode = `type ResponseType = "json" | "text"`

const hookInfoCode = `type HookInfo = {
  source: string       // Source name (e.g., "api")
  group?: string       // Group name (e.g., "users")
  query: string        // Method name (e.g., "getById")
  variables?: unknown  // Request variables
}`

const mergeOptionsCode = `type MergeOptions = {
  pathOptions?: PathOptions
}

type PathOptions = (
  request?: NextRequest,
) => PathOptionsResult | Promise<PathOptionsResult>

type PathOptionsResult =
  | Record<string, boolean | number | string | null | undefined>
  | undefined`

const contextCode = `type Context = {
  req?: NextRequest    // Incoming Next.js request (proxy mode)
  res?: NextResponse   // Outgoing Next.js response
  headers?: Headers    // Request headers to forward (direct mode)
}`

const sourcesCode = `type Sources = Record<string, Request<AnyGroups | undefined>>

type AnyGroups = {
  [k: string]: RequestGroup
}`

const requestGroupOptionsCode = `type RequestGroupOptions = MergeOptions & {
  prefix?: string  // URL prefix for all methods in this group
}`

const successResponseCode = `type SuccessResponse<D = unknown> = {
  success: true
  data: D
}`

const clientRequestDefaultsCode = `type ClientRequestDefaults = {
  requestPage?: string
  timeout?: number
  credentials?: RequestCredentials
  headers?: Record<string, string>
  onError?: (error: HTTPError) => void | Promise<void>
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const directRequestDefaultsCode = `type DirectRequestDefaults = {
  timeout?: number
  headers?: Record<string, string>
  onError?: (error: HTTPError) => void | Promise<void>
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const generateMethodOptionsCode = `type GenerateMethodOptions = SimpleOptions & {
  vars?: FormData | Record<string, unknown>
  stream?: boolean
}`

const queryTypesCode = `// Utility types for query/method resolution

// Extracts all valid query strings for a source
type MethodGroup<T> = ClassMethods<T> | TransformToGroup<Groups<T>>
// Result: "methodName" | "group:methodName"

// Resolves the actual Method type from a query string
type MethodSource<T, Q> = /* resolves to Method<R, V> */

// Extracts response type from a Method
type MethodQueryResponse<M extends Method<any, any>> = M extends Method<infer R, any> ? R : unknown

// Extracts variables type from a Method
type MethodQueryVariables<M extends Method<any, any>> = M extends Method<any, infer V> ? V : unknown

// Determines arguments based on mode and variables
type RequestArguments<Q, M, D> =
  D extends false
    ? V extends undefined ? [Q] : [Q, V]                  // Proxy mode
    : V extends undefined ? [Q, Context?] : [Q, V, Context?]  // Direct mode

// Return type based on rawData flag
type MethodRequestResponse<RD, R> = Promise<
  RD extends true ? Partial<MethodKyResponse<R>> : R
>`

const nexusQueryOptionsCode = `// React Query integration types

type NexusQueryOptions<R, V> = WithVariables<V> &
  Omit<UseQueryOptions<R, Error, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: MethodsInstanceOptions
  }

type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, Error, [V] extends [undefined] ? void : V>,
  "mutationFn"
> & {
  requestOptions?: MethodsInstanceOptions
}

type WithVariables<V> = [V] extends [undefined]
  ? { variables?: undefined }
  : { variables: V }`

export const metadata = docsMetadata("Types", "Complete reference for all TypeScript types exported by @noverax/nexus.")

export default async function TypesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Types"
        description="Complete reference for all TypeScript types exported by @noverax/nexus."
        badge="Reference"
      />

      <Prose>
        <h2 id="overview">Overview</h2>
        <p>
          This page lists all TypeScript types used across the Nexus library. Types are organized by
          category — from the high-level request functions down to the internal method types.
        </p>
      </Prose>

      <Prose>
        <h2 id="request-functions">Request Function Types</h2>
        <h3 id="common-request">CommonRequest</h3>
        <p>
          The curried request function type returned by <InlineCode>createClientRequest</InlineCode>,{" "}
          <InlineCode>createDirectRequest</InlineCode>, and{" "}
          <InlineCode>createQueryRequest</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={commonRequestCode} language="typescript" />

      <Prose>
        <h3 id="client-request-defaults">ClientRequestDefaults</h3>
        <p>
          Options for <InlineCode>createClientRequest</InlineCode> and{" "}
          <InlineCode>createQueryRequest</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={clientRequestDefaultsCode} language="typescript" />

      <Prose>
        <h3 id="direct-request-defaults">DirectRequestDefaults</h3>
        <p>
          Options for <InlineCode>createDirectRequest</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={directRequestDefaultsCode} language="typescript" />

      <Prose>
        <h2 id="method-types">Method Definition Types</h2>
        <h3 id="method">Method</h3>
        <p>
          The type of a query method definition. Generic over response type{" "}
          <InlineCode>R</InlineCode> and variables type <InlineCode>V</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={methodCode} language="typescript" />

      <Prose>
        <h3 id="methods-type">Methods</h3>
      </Prose>

      <CodeBlock code={methodsCode} language="typescript" />

      <Prose>
        <h3 id="methods-instance-type">MethodsInstance</h3>
        <p>
          The object your method definitions receive. Contains all six HTTP method functions.
        </p>
      </Prose>

      <CodeBlock code={methodsInstanceCode} language="typescript" />

      <Prose>
        <h2 id="response-types">Response Types</h2>
        <h3 id="method-ky-response">MethodKyResponse</h3>
      </Prose>

      <CodeBlock code={methodKyResponseCode} language="typescript" />

      <Prose>
        <h3 id="success-response">SuccessResponse</h3>
        <p>
          Convenience type for standard success response wrappers.
        </p>
      </Prose>

      <CodeBlock code={successResponseCode} language="typescript" />

      <Prose>
        <h2 id="options-types">Options Types</h2>
        <h3 id="methods-instance-options">MethodsInstanceOptions</h3>
        <p>
          Per-request options passed when calling a source method.
        </p>
      </Prose>

      <CodeBlock code={methodsInstanceOptionsCode} language="typescript" />

      <Prose>
        <h3 id="method-parameters-type">MethodParameters</h3>
      </Prose>

      <CodeBlock code={methodParametersCode} language="typescript" />

      <Prose>
        <h3 id="method-options-type">MethodOptions</h3>
      </Prose>

      <CodeBlock code={methodOptionsCode} language="typescript" />

      <Prose>
        <h3 id="generate-method-options">GenerateMethodOptions</h3>
      </Prose>

      <CodeBlock code={generateMethodOptionsCode} language="typescript" />

      <Prose>
        <h2 id="upload-types">Upload Types</h2>
        <h3 id="upload-progress">UploadProgress</h3>
      </Prose>

      <CodeBlock code={uploadProgressCode} language="typescript" />

      <Prose>
        <h2 id="source-types">Source & Config Types</h2>
        <h3 id="base-options">BaseOptions</h3>
        <p>
          The core configuration type for <InlineCode>Request</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={baseOptionsCode} language="typescript" />

      <Prose>
        <h3 id="response-type-enum">ResponseType</h3>
      </Prose>

      <CodeBlock code={responseTypeCode} language="typescript" />

      <Prose>
        <h3 id="sources-type">Sources</h3>
      </Prose>

      <CodeBlock code={sourcesCode} language="typescript" />

      <Prose>
        <h3 id="request-group-options">RequestGroupOptions</h3>
      </Prose>

      <CodeBlock code={requestGroupOptionsCode} language="typescript" />

      <Prose>
        <h2 id="hook-types">Hook Types</h2>
        <h3 id="hook-info">HookInfo</h3>
      </Prose>

      <CodeBlock code={hookInfoCode} language="typescript" />

      <Prose>
        <h3 id="merge-options">MergeOptions & PathOptions</h3>
      </Prose>

      <CodeBlock code={mergeOptionsCode} language="typescript" />

      <Prose>
        <h2 id="context-types">Context Types</h2>
        <h3 id="context">Context</h3>
      </Prose>

      <CodeBlock code={contextCode} language="typescript" />

      <Prose>
        <h2 id="query-utility-types">Query Utility Types</h2>
        <p>
          Internal utility types that power the type inference engine. These resolve source names,
          group names, and method signatures into fully typed request calls.
        </p>
      </Prose>

      <CodeBlock code={queryTypesCode} language="typescript" />

      <Callout variant="info" title="Type inference">
        <p>
          These utility types are what make Nexus fully type-safe. When you call{" "}
          <InlineCode>request(&quot;api&quot;)(&quot;users:getById&quot;, {"{ id }"} )</InlineCode>,
          TypeScript resolves the source, group, method, variables, and response types
          automatically.
        </p>
      </Callout>

      <Prose>
        <h2 id="react-query-types">React Query Types</h2>
        <h3 id="nexus-query-options">NexusQueryOptions & NexusMutationOptions</h3>
      </Prose>

      <CodeBlock code={nexusQueryOptionsCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/core-concepts/type-safety">Type Safety Guide</Link> — how type
            inference works in practice
          </li>
          <li>
            <Link href="/docs/api/create-client-request">createClientRequest</Link> — uses
            CommonRequest and ClientRequestDefaults
          </li>
          <li>
            <Link href="/docs/api/request">Request</Link> — uses BaseOptions
          </li>
          <li>
            <Link href="/docs/api/instance">Instance</Link> — uses MethodsInstance and
            MethodKyResponse
          </li>
        </ul>
      </Prose>
    </div>
  )
}
