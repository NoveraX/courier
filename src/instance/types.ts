/// <reference types="next" />
import type ky from "ky";
import type { Options, SearchParamsOption } from "ky";
import type { NextRequest, NextResponse } from "next/server";

import type { RequestGroupOptions } from "../RequestClass";

type KyInstance = typeof ky;

export type Methods = Exclude<KyMethods, "delete"> | "del";

type KyMethods = keyof Omit<KyInstance, "create" | "extend" | "retry" | "stop">;

export type AnyMethods = Partial<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: (methods: MethodsInstance, variables: any) => Promise<any> | any;
}>;

export type MethodsInstance = {
  [K in Methods]: <T = unknown>(...arguments_: MethodParameters<K>) => Promise<MethodKyResponse<T>>;
};

export type GenerateMethodOptions = SimpleOptions & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vars?: Record<string, any>;
};

export type MethodsInstanceOptions<R extends boolean = false> = SimpleOptions & {
  rawData?: R;
  passVars?: boolean;
};

export type MethodsInstanceDatasourceOptions = RequestGroupOptions;

export type MethodResponse<R extends boolean = false> = R extends true ? unknown : MethodKyResponse;

export type MethodKyResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
};

export type MethodParameters<T extends Methods> = T extends "head"
  ? [url?: string, options?: MethodOptions<T>]
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [url?: string, variables?: Record<string, any>, options?: MethodOptions<T>];

// eslint-disable-next-line unicorn/prevent-abbreviations
export type OptionsWithSearchParams = Omit<Options, "searchParams"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchParams?: Record<string, any>;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultData?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultQueryParams?: Record<string, any>;
    validHeaders?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bodyEncoder?: (object: Record<string, any>) => BodyInit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    searchParamsEncoder?: (object: Record<string, any>) => SearchParamsOption;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    searchParamsParse?: (string: string) => Record<string, any>;
    requestAbort?: boolean;
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
