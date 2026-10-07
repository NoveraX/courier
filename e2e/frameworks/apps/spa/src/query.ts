import { createCaller } from "@noverax/courier";
import { createQueryCaller } from "@noverax/courier-react";

import { api, publicApi } from "./api";

/* Called from the browser itself, which sends its own cookies. */
export const q = createQueryCaller(api);
export const anonymous = createCaller(publicApi);
