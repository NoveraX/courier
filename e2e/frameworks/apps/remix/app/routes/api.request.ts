import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-remix";

import { catalog } from "../catalog";

/* The proxy a page's client built from the routes calls, serving the API they come from. */
registerSources({ catalog });

const handler = courierHandler();
export const loader = handler;
export const action = handler;
