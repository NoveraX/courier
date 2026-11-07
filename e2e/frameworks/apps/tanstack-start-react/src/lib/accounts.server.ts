import { createServerCaller } from "@noverax/courier-tanstack-start/react";

import { accountsApi } from "./accounts";

export const accounts = createServerCaller(accountsApi);
