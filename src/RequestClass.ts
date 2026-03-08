import type { Instance } from "./instance/index";
import type { BaseOptions, MergeOptions, MethodKyResponse } from "./instance/types";

export type Methods = ReturnType<Instance["methodsInstance"]>;

export type Method<R, V = undefined> = (
  methods: Methods,
  variables: V,
) => MethodKyResponse<R> | Promise<MethodKyResponse<R>>;

export type RequestGroupType = Record<string, InstanceType<typeof RequestGroup>>;

type RequestOptions<T extends RequestGroupType | undefined> = BaseOptions &
  (T extends RequestGroupType
    ? {
        groups: T;
      }
    : {});

export class Request<T extends RequestGroupType | undefined = undefined> {
  constructor(public options?: RequestOptions<T>) {}
}

export type RequestGroupOptions = MergeOptions & {
  prefix?: string;
};

export class RequestGroup {
  constructor(public options?: RequestGroupOptions) {}
}
