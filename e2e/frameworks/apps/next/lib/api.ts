import { createServerCaller } from "@noverax/courier-next";

import { api } from "./definition";

export { api, type Seen } from "./definition";

export const client = createServerCaller(api);
