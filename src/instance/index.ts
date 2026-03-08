import ky, {
  HTTPError as KYHTTPError,
  type KyResponse,
  type Options,
  type SearchParamsOption,
} from "ky";

import HTTPError from "../error";
import { afterResponse, beforeRequestHook, supportsAbortController } from "../hooks/index";
import { generateUrl, getUrl, isFormData } from "../utils/helpers";
import mergeHeaders from "../utils/merge-headers";
import type {
  BaseOptions,
  Context,
  GenerateMethodOptions,
  MethodParameters,
  Methods,
  MethodsInstance,
  MethodsInstanceDatasourceOptions,
  PathOptions,
  ResponseType,
} from "./types";

const methods: Methods[] = ["get", "post", "put", "patch", "del", "head"];

export class Instance {
  // TODO support different responseType values (json / text) through the rawData generic
  private responseType!: ResponseType;
  private defaultData!: Record<string, any>;
  private defaultQueryParams!: Record<string, any>;
  private extraHeaders?: string[];
  private pathOptions?: PathOptions;
  private bodyEncoder?: (object: Record<string, any>) => BodyInit;
  private searchParamsEncoder?: (object: Record<string, any>) => SearchParamsOption;
  private searchParamsParse?: (string: string) => Record<string, any>;
  private options!: Options;

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

  private _http!: ReturnType<typeof ky.create>;

  private get http() {
    return this._http;
  }

  private toSearchParams(variables?: Record<string, any>) {
    if (!variables || Object.keys(variables).length === 0) return;

    if (this.searchParamsEncoder) {
      return this.searchParamsEncoder(variables);
    }

    return new URLSearchParams(variables);
  }

  private clearVariables(variables?: FormData | Record<string, any>) {
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
    variables?: FormData | Record<string, any>,
    searchParameters?: Record<string, any>,
  ): Pick<Options, "body" | "json" | "searchParams"> | undefined {
    this.clearVariables(variables);

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
          const bodyVariables = [...(variables?.entries() || [])]
            .map(([key, value]) => {
              if (
                typeof value === "object" &&
                "size" in value &&
                "type" in value &&
                "name" in value &&
                "lastModified" in value &&
                (value as unknown as Record<string, number>).size === 0
              ) {
                return key;
              }
              return undefined;
            })
            .filter(Boolean) as string[];

          for (const key of bodyVariables) {
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

  private async getResponse<T>(response: KyResponse, message?: string) {
    const data = await this.getResponseData<T>(response, message);

    const { status, headers } = response;

    return { status, headers, data };
  }

  private async getResponseData<T>(response: KyResponse, message?: string) {
    switch (this.responseType) {
      case "json": {
        try {
          if (response.status === 204) {
            return null as T;
          }

          return await response.json<T>();
        } catch (error) {
          if (error instanceof Error) {
            return (message || error.message) as T;
          }

          return (message || "fetch failed") as T;
        }
      }
      default: {
        // TODO add a text variant
        try {
          return await response.json<T>();
        } catch (error) {
          if (error instanceof Error) {
            return (message || error.message) as T;
          }

          return (message || "fetch failed") as T;
        }
      }
    }
  }

  private generateMethod(
    method: Methods,
    generateOptions?: GenerateMethodOptions,
    datasourceOptions?: MethodsInstanceDatasourceOptions,
  ) {
    const { vars, headers: kyHeaders, stream, ...kyOptions } = generateOptions || {};
    const { prefix = "", pathOptions } = datasourceOptions || {};

    this.clearVariables(vars);

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
        vars,
        generatedPathOptions,
        this.searchParamsParse,
      );

      const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[1] || {};

      const headers = mergeHeaders(kyHeaders, optionHeaders, this.extraHeaders);

      const prefixUrlOverride = baseUrl ? { prefixUrl: baseUrl } : {};

      let options: Options = {
        ...otherArgumentOptions,
        ...kyOptions,
        ...prefixUrlOverride,
        headers,
        searchParams: this.toSearchParams({
          ...this.defaultQueryParams,
          ...newSearchParameters,
        }),
      };

      if (method !== "head") {
        const searchParameters =
          arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

        const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

        const headers = mergeHeaders(kyHeaders, optionHeaders, this.extraHeaders);

        options = {
          ...otherArgumentOptions,
          ...kyOptions,
          ...prefixUrlOverride,
          headers,
          ...this.generateVariables(method, arguments_[1] || newVariables, {
            ...searchParameters,
            ...newSearchParameters,
          }),
        };
      }

      try {
        const response = await this.http[method === "del" ? "delete" : method](url, options);

        if (stream) {
          return {
            status: response.status,
            headers: response.headers,
            data: response.body,
          } as Awaited<ReturnType<typeof this.getResponse<T>>>;
        }

        return await this.getResponse<T>(response);
      } catch (error) {
        if (error instanceof KYHTTPError) {
          const response = await this.getResponse<T>(error.response, error.message);
          throw new HTTPError(response);
        }

        if (error instanceof Error && error.cause instanceof Error && "code" in error.cause) {
          throw new HTTPError({
            status: 0,
            headers: new Headers(),
            data: {
              success: false,
              message: error.cause.message,
              code: (error.cause as Error & { code: string }).code,
            },
          });
        }

        throw error;
      } finally {
        this.currentExecutingRequests = {};
      }
    };
  }

  methodsInstance(
    options?: GenerateMethodOptions,
    datasourceOptions?: MethodsInstanceDatasourceOptions,
  ) {
    const methodsInstance = {} as MethodsInstance;

    for (const method of methods) {
      methodsInstance[method] = this.generateMethod(method, options, datasourceOptions);
    }

    return methodsInstance;
  }
}

export default Instance;
