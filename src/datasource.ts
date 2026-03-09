import type { BaseOptions, HttpMethods, HttpResponse, MergeOptions } from "./instance/types";

export type EndpointGroupRecord = Record<string, InstanceType<typeof EndpointGroup>>;

export type Endpoint<R, V = undefined> = (
  methods: HttpMethods,
  variables: V,
) => HttpResponse<R> | Promise<HttpResponse<R>>;

type DatasourceOptions<T extends EndpointGroupRecord | undefined> = BaseOptions &
  (T extends EndpointGroupRecord
    ? {
        groups: T;
      }
    : {});

export class Datasource<T extends EndpointGroupRecord | undefined = undefined> {
  constructor(public options?: DatasourceOptions<T>) {}
}

export type EndpointGroupOptions = MergeOptions & {
  prefix?: string;
};

export class EndpointGroup {
  constructor(public options?: EndpointGroupOptions) {}
}
