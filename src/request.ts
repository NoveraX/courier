import ky, { HTTPError as KYHTTPError } from "ky";

import HTTPError from "./error";
import type { CommonRequest, QueryOverrides } from "./types";
import { type CreateRequestOptions, getRequestOptions, isFormData } from "./utils/helpers";

export const request: CommonRequest<QueryOverrides> =
  (source, options) =>
  async (...arguments_) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [queryRequest, variables] = arguments_ as [string, any] | [string];
    const [queryGroup, queryMethod] = queryRequest.split(":");
    const group = queryMethod ? queryGroup : undefined;
    const query = queryMethod || queryGroup;

    const { cache, onDownloadProgress, next, signal, ...kyOptions } = options || {};

    const requestPage = process.env.NEXT_PUBLIC_REQUEST_PAGE || "request";

    let requestOptions:
      | { body: FormData; json?: undefined }
      | { json: Partial<CreateRequestOptions>; body?: undefined };

    if (isFormData(variables)) {
      variables.append("_source", source);
      variables.append("_group", group || "");
      variables.append("_query", query);
      variables.append("_options", JSON.stringify(kyOptions));

      requestOptions = { body: variables };
    } else {
      requestOptions = {
        json: {
          source,
          group,
          query,
          variables,
          options: kyOptions,
        },
      };
    }

    try {
      const response = await ky
        .post(`/api/${requestPage}`, {
          ...requestOptions,
          credentials: "include",
          cache,
          onDownloadProgress,
          next,
          signal,
          timeout: kyOptions.timeout,
        })
        .json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response as any;
    } catch (error) {
      if (error instanceof KYHTTPError) {
        const response = await error.response.json();
        let responseResult = response;

        const { options } = getRequestOptions(requestOptions.body || requestOptions.json);
        const { rawData } = typeof options === "object" ? options : {};

        responseResult = rawData
          ? {
              ...response,
              status: error.response.status,
              headers: error.response.headers,
            }
          : {
              status: error.response.status,
              headers: error.response.headers,
              data: response,
            };

        throw new HTTPError(responseResult);
      }

      throw error;
    }
  };

export default request;
