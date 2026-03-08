import ky, {
  HTTPError as KYHTTPError,
  type KyResponse,
  type Options,
  type SearchParamsOption,
} from "ky";

import { HTTPError } from "../error";
import { afterResponse, beforeRequestHook, supportsAbortController } from "../hooks/index";
import { generateUrl, getUrl, isFormData } from "../utils/helpers";
import { mergeHeaders } from "../utils/merge-headers";

const extractHeaders = (value: unknown): HeadersInit | undefined => {
  if (value instanceof Headers) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value as Record<string, string>;
  return undefined;
};

import type {
  BaseOptions,
  Context,
  GenerateMethodOptions,
  MethodKyResponse,
  MethodParameters,
  Methods,
  MethodsInstance,
  MethodsInstanceDatasourceOptions,
  PathOptions,
  ResponseType,
} from "./types";

export class Instance {
  private responseType: ResponseType = "json";
  private defaultData: Record<string, unknown> = {};
  private defaultQueryParams?: Record<string, unknown>;
  private extraHeaders?: string[];
  private pathOptions?: PathOptions;
  private bodyEncoder?: (object: Record<string, unknown>) => BodyInit;
  private searchParamsEncoder?: (object: Record<string, unknown>) => SearchParamsOption;
  private searchParamsParse?: (string: string) => Record<string, unknown>;
  private options: Options = {};

  context?: Context;
  currentExecutingRequests: { [key: string]: AbortController } = {};

  constructor(options?: BaseOptions, context?: Context) {
    this.init(options, context);
  }

  private init(options?: BaseOptions, context?: Context) {
    this.context = context;
    const {
      baseURL,
      responseType = "json",
      defaultData,
      defaultQueryParams,
      extraHeaders,
      pathOptions,
      bodyEncoder,
      searchParamsEncoder,
      searchParamsParse,
      requestAbort,
      hooks,
      onRequest: _onRequest,
      onResponse: _onResponse,
      onError: _onError,
      ...kyOptions
    } = options || {};

    this.responseType = responseType;
    this.defaultData = { ...defaultData };
    this.extraHeaders = extraHeaders;
    this.pathOptions = pathOptions;
    this.bodyEncoder = bodyEncoder;
    this.searchParamsEncoder = searchParamsEncoder;
    this.searchParamsParse = searchParamsParse;

    if (defaultQueryParams) {
      this.defaultQueryParams = { ...defaultQueryParams };
    }

    const newHooks = {
      ...hooks,
    };

    if (requestAbort && supportsAbortController) {
      newHooks.afterResponse = [...(newHooks?.afterResponse ?? []), afterResponse.bind(this)];

      newHooks.beforeRequest = [...(newHooks?.beforeRequest ?? []), beforeRequestHook.bind(this)];
    }

    this.options = {
      ...kyOptions,
      hooks: newHooks,
      prefixUrl: baseURL,
    };

    this._http = ky.create(this.options);
  }

  private _http: ReturnType<typeof ky.create> = ky.create({});

  private get http() {
    return this._http;
  }

  private toSearchParams(variables?: Record<string, unknown>) {
    if (!variables || Object.keys(variables).length === 0) return;

    if (this.searchParamsEncoder) {
      return this.searchParamsEncoder(variables);
    }

    return new URLSearchParams(Object.entries(variables).map(([k, v]) => [k, String(v)]));
  }

  private clearVariables(variables?: FormData | Record<string, unknown>) {
    if (isFormData(variables)) {
      for (const key of variables.keys()) {
        if (variables.get(key) === undefined) {
          variables.delete(key);
        }
      }

      return variables;
    }

    if (typeof variables === "object" && variables !== null) {
      return Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined));
    }

    return;
  }

  private generateVariables(
    method: Methods,
    variables?: FormData | Record<string, unknown>,
    searchParameters?: Record<string, unknown>,
  ): Pick<Options, "body" | "json" | "searchParams"> | undefined {
    variables = this.clearVariables(variables);

    switch (method) {
      case "head": {
        return;
      }
      case "get":
      case "del": {
        const searchParameters_ = this.toSearchParams({
          ...this.defaultQueryParams,
          ...this.defaultData,
          ...searchParameters,
          ...variables,
        });

        if (searchParameters_) {
          return { searchParams: searchParameters_ };
        }
        return;
      }
      default: {
        const searchParameters_ = this.toSearchParams({
          ...this.defaultQueryParams,
          ...searchParameters,
        });
        const json = {
          ...this.defaultData,
          ...(isFormData(variables) ? {} : variables),
        };

        if (isFormData(variables)) {
          const emptyFileKeys = [...variables.entries()]
            .filter(([, value]) => value instanceof File && value.size === 0)
            .map(([key]) => key);

          for (const key of emptyFileKeys) {
            variables.delete(key);
          }
        }

        return {
          ...(searchParameters_ ? { searchParams: searchParameters_ } : {}),
          ...(!this.bodyEncoder && Object.keys(json).length > 0 ? { json } : {}),
          ...(this.bodyEncoder && Object.keys(json).length > 0
            ? { body: this.bodyEncoder(json) }
            : {}),
          ...(isFormData(variables) ? { body: variables } : {}),
        };
      }
    }
  }

  private async getResponse(response: KyResponse, message?: string) {
    const data = await this.getResponseData(response, message);

    const { status, headers } = response;

    return { status, headers, data };
  }

  private async getResponseData(response: KyResponse, message?: string): Promise<unknown> {
    if (response.status === 204) {
      return null;
    }

    try {
      return this.responseType === "json" ? await response.json() : await response.text();
    } catch {
      const fallbackMessage = message || "Failed to parse response body";
      throw new HTTPError({
        status: response.status,
        headers: response.headers,
        data: { success: false, message: fallbackMessage },
      });
    }
  }

  private generateMethod(
    method: Methods,
    generateOptions?: GenerateMethodOptions,
    datasourceOptions?: MethodsInstanceDatasourceOptions,
  ) {
    const { vars, headers: kyHeaders, stream, ...kyOptions } = generateOptions || {};
    const { prefix = "", pathOptions } = datasourceOptions || {};

    const cleanedVars = this.clearVariables(vars);

    return async <T>(...arguments_: MethodParameters<typeof method>) => {
      const commonPathOptions = (await this.pathOptions?.(this.context?.req)) || {};
      const groupPathOptions = (await pathOptions?.(this.context?.req)) || {};
      const generatedPathOptions = {
        ...commonPathOptions,
        ...groupPathOptions,
      };

      const { path, baseUrl } = getUrl(prefix, arguments_[0]);

      const [url, newVariables, newSearchParameters] = generateUrl(
        path,
        cleanedVars,
        generatedPathOptions,
        this.searchParamsParse,
      );

      const prefixUrlOverride = baseUrl ? { prefixUrl: baseUrl } : {};

      let options: Options;

      if (method === "head") {
        const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[1] || {};

        options = {
          ...otherArgumentOptions,
          ...kyOptions,
          ...prefixUrlOverride,
          headers: mergeHeaders(kyHeaders, extractHeaders(optionHeaders), this.extraHeaders),
          searchParams: this.toSearchParams({
            ...this.defaultQueryParams,
            ...newSearchParameters,
          }),
        };
      } else {
        const searchParameters =
          arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

        const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

        options = {
          ...otherArgumentOptions,
          ...kyOptions,
          ...prefixUrlOverride,
          headers: mergeHeaders(kyHeaders, optionHeaders, this.extraHeaders),
          ...this.generateVariables(method, arguments_[1] || newVariables, {
            ...searchParameters,
            ...newSearchParameters,
          }),
        };
      }

      try {
        const response = await this.http[method === "del" ? "delete" : method](url, options);

        const result = stream
          ? { status: response.status, headers: response.headers, data: response.body }
          : await this.getResponse(response);

        return result as MethodKyResponse<T>;
      } catch (error) {
        if (error instanceof KYHTTPError) {
          const response = await this.getResponse(error.response, error.message);
          throw new HTTPError(response);
        }

        if (error instanceof Error && error.cause instanceof Error && "code" in error.cause) {
          throw new HTTPError({
            status: 0,
            headers: new Headers(),
            data: {
              success: false,
              message: error.cause.message,
              code: String(error.cause.code),
            },
          });
        }

        throw error;
      }
    };
  }

  methodsInstance(
    options?: GenerateMethodOptions,
    datasourceOptions?: MethodsInstanceDatasourceOptions,
  ): MethodsInstance {
    return {
      get: this.generateMethod("get", options, datasourceOptions),
      post: this.generateMethod("post", options, datasourceOptions),
      put: this.generateMethod("put", options, datasourceOptions),
      patch: this.generateMethod("patch", options, datasourceOptions),
      del: this.generateMethod("del", options, datasourceOptions),
      head: this.generateMethod("head", options, datasourceOptions),
    };
  }
}
