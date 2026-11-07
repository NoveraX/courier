import { requestContext } from "@noverax/courier-tanstack-start/react";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
    createMiddleware().server(requestContext()),
  ],
}));
