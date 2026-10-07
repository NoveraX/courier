// @refresh reload
import { registerRequestContext } from "@noverax/courier";
import { solidStartRequestContext } from "@noverax/courier-solid";
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";

registerRequestContext(solidStartRequestContext(getRequestEvent));

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
