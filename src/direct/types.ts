import type { Request } from "../RequestClass";
import type { AnyGroups } from "../types";

export type Sources = Record<string, Request<AnyGroups | undefined>>;
