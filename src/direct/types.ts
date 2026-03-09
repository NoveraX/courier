import type { Datasource } from "../datasource";
import type { GroupsRecord } from "../types";

export type Sources = Record<string, Datasource<GroupsRecord | undefined>>;
