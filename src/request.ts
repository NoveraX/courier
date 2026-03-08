import { createClientRequest } from "./create";
import type { QueryOverrides } from "./types";

export const request = createClientRequest<QueryOverrides>();

export default request;
