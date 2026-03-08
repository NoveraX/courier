/// <reference types="next" />
import type ky from "ky";
import type { Options, SearchParamsOption } from "ky";
import type { NextRequest, NextResponse } from "next/server";

import type { HTTPError } from "../error";
import type { RequestGroupOptions } from "../RequestClass";

type KyInstance = typeof ky;

export type Methods = Exclude<KyMethods, "delete"> | "del";

type KyMethods = keyof Omit<KyInstance, "create" | "extend" | "retry" | "stop">;

export type AnyMethods = Partial<{
  [k: string]: (
    methods: MethodsInstance,
    variables: unknown,
  ) => Promise<MethodKyResponse<unknown>> | MethodKyResponse<unknown>;
}>;

export type MethodsInstance = {
  [K in Methods]: <T = unknown>(...arguments_: MethodParameters<K>) => Promise<MethodKyResponse<T>>;
};

export type GenerateMethodOptions = SimpleOptions & {
  vars?: FormData | Record<string, unknown>;
  stream?: boolean;
};

export type UploadProgress = {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
};

export type MethodsInstanceOptions<R extends boolean = false> = Omit<
  SimpleOptions,
  "onUploadProgress"
> & {
  rawData?: R;
  passVars?: boolean;
  stream?: boolean;
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type MethodsInstanceDatasourceOptions = RequestGroupOptions;

export type MethodKyResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
};

export type MethodParameters<T extends Methods> = T extends "head"
  ? [url?: string, options?: MethodOptions<T>]
  : [url?: string, variables?: Record<string, unknown>, options?: MethodOptions<T>];

export type OptionsWithSearchParams = Omit<Options, "searchParams"> & {
  searchParams?: Record<string, unknown>;
};

export type SimpleOptions = Omit<OptionsWithSearchParams, "body" | "json" | "searchParams">;

export type MethodOptions<T extends Methods> = T extends "delete" | "get" | "head"
  ? SimpleOptions
  : OptionsWithSearchParams;

export type ResponseType = "json" | "text";

export type BaseOptions = MergeOptions &
  Omit<Options, "body" | "json" | "prefixUrl" | "searchParams"> & {
    baseURL?: string;
    responseType?: ResponseType;
    defaultData?: Record<string, unknown>;
    defaultQueryParams?: Record<string, unknown>;
    extraHeaders?: string[];
    bodyEncoder?: (object: Record<string, unknown>) => BodyInit;
    searchParamsEncoder?: (object: Record<string, unknown>) => SearchParamsOption;
    searchParamsParse?: (string: string) => Record<string, unknown>;
    requestAbort?: boolean;
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
  query: string;
  variables?: unknown;
};

export type MergeOptions = {
  pathOptions?: PathOptions;
};

export type PathOptions = (request?: NextRequest) => PathOptionsResult | Promise<PathOptionsResult>;

type PathOptionsResult = Record<string, boolean | number | string | null | undefined> | undefined;

export type Context = {
  req?: NextRequest;
  res?: NextResponse;
  headers?: Headers;
};
