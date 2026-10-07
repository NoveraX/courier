import { registerRequestContext } from "@noverax/courier";
import { svelteKitRequestContext } from "@noverax/courier-sveltekit";
import { getRequestEvent } from "$app/server";

registerRequestContext(svelteKitRequestContext(getRequestEvent));
