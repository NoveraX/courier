import { registerSources } from "@noverax/courier";
import { apiRoute } from "@noverax/courier-next";

import { api } from "../../../lib/api";
import { catalog } from "../../../lib/routes-api";

registerSources({ accounts: api, catalog });

export const { GET, POST } = apiRoute();
