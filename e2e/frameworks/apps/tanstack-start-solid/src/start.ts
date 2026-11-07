import { requestContext } from "@noverax/courier-tanstack-start/solid";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/solid-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
    createMiddleware().server(requestContext()),
  ],
}));
