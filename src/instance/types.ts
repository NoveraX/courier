/// <reference types="next" />
import type ky from "ky";
import type { Options } from "ky";
import type { NextRequest, NextResponse } from "next/server";

import type { HTTPError } from "../error";

type KyInstance = typeof ky;

export type HttpMethod = Exclude<KyMethods, "delete"> | "del";

type KyMethods = keyof Omit<KyInstance, "create" | "extend" | "retry" | "stop">;

export type AnyEndpoints = Partial<{
  [k: string]: (
    methods: HttpMethods,
    variables: unknown,
  ) => Promise<HttpResponse<unknown>> | HttpResponse<unknown>;
}>;

export type HttpMethods = {
  [K in HttpMethod]: <T = unknown>(...arguments_: MethodParameters<K>) => Promise<HttpResponse<T>>;
};

export type BoundMethodOptions = SimpleOptions & {
  variables?: FormData | Record<string, unknown>;
  stream?: boolean;
};

export type UploadProgress = {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
};

export type CallOptions<R extends boolean = false> = Omit<SimpleOptions, "onUploadProgress"> & {
  rawData?: R;
  forwardVariables?: boolean;
  stream?: boolean;
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type HttpResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
};

export type MethodParameters<T extends HttpMethod> = T extends "head"
  ? [url?: string, options?: MethodOptions<T>]
  : [url?: string, variables?: Record<string, unknown>, options?: MethodOptions<T>];

export type OptionsWithSearchParams = Omit<Options, "searchParams"> & {
  searchParams?: Record<string, unknown>;
};

export type SimpleOptions = Omit<OptionsWithSearchParams, "body" | "json" | "searchParams">;

export type MethodOptions<T extends HttpMethod> = T extends "delete" | "get" | "head"
  ? SimpleOptions
  : OptionsWithSearchParams;

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "formData";

export type SearchParamsSerializer = {
  stringify: (obj: Record<string, unknown>) => string;
  parse: (str: string) => Record<string, unknown>;
};

export type BaseOptions = MergeOptions &
  Omit<Options, "body" | "json" | "prefixUrl" | "searchParams"> & {
    baseURL?: string;
    responseType?: ResponseType;
    responseParser?: (response: Response) => Promise<unknown>;
    defaultBody?: Record<string, unknown>;
    defaultQueryParams?: Record<string, unknown>;
    allowedHeaders?: string[];
    bodySerializer?: (data: Record<string, unknown>) => BodyInit;
    searchParamsSerializer?: SearchParamsSerializer;
    deduplicate?: boolean;
    onRequest?: (info: HookInfo) => HookInfo | undefined | Promise<HookInfo | undefined>;
    onResponse?: (
      info: HookInfo,
      response: { status: number; data: unknown },
    ) =>
      | { status: number; data: unknown }
      | undefined
      | Promise<{ status: number; data: unknown } | undefined>;
    onError?: (info: HookInfo, error: HTTPError) => undefined | Promise<undefined>;
  };

export type HookInfo = {
  source: string;
  group?: string;
  method: string;
  variables?: unknown;
};

export type MergeOptions = {
  pathOptions?: PathOptions;
};

export type GroupOptions = MergeOptions & {
  prefix?: string;
};

export type PathOptions = (request?: NextRequest) => PathOptionsResult | Promise<PathOptionsResult>;

type PathOptionsResult = Record<string, boolean | number | string | null | undefined> | undefined;

export type Context = {
  req?: NextRequest;
  res?: NextResponse;
  headers?: Headers;
};
