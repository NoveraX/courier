import { createServerCaller } from "@noverax/courier-tanstack-start/solid";

import { accountsApi } from "./accounts";

export const accounts = createServerCaller(accountsApi);
