import type { Context } from "../instance/types";
import type { CommonRequest } from "../types";
import createRequest from "../utils/createRequest";
import type { Sources } from "./types";

type DirectRequest = <T extends Sources>(sources: T) => CommonRequest<T, true>;

const isContext = (value: unknown): value is Context =>
  typeof value === "object" &&
  value !== null &&
  (("req" in value && value.req instanceof Request) ||
    ("res" in value && value.res instanceof Response) ||
    ("headers" in value && value.headers instanceof Headers));

export const setup: DirectRequest =
  (sources) =>
  (source, options) =>
  async (...arguments_) => {
    const queryArguments = arguments_ as [string, Context] | [string, Record<string, any>, Context];

    const [queryRequest] = queryArguments;
    const [queryGroup, queryMethod] = queryRequest.split(":");
    const group = queryMethod ? queryGroup : undefined;
    const query = queryMethod || queryGroup;

    const variables = isContext(queryArguments[1]) ? undefined : queryArguments[1];

    const requestOptions = {
      source: source as string,
      group,
      query,
      variables,
      options,
    };

    const context = (queryArguments.length > 2 ? queryArguments[2] : queryArguments[1]) as Context;

    return createRequest(sources, requestOptions, context) as any;
  };

export default setup;
