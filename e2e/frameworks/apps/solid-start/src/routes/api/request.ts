import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-solid";

import { catalog } from "~/lib/catalog";

/* The proxy a page's client built from the routes calls, serving the API they come from. */
registerSources({ catalog });

const handler = courierHandler();
export const GET = handler;
export const POST = handler;
