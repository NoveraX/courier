import { requestContext } from "@noverax/courier-express";
import { createRequestHandler } from "@remix-run/express";
import compression from "compression";
import express from "express";

import * as build from "./build/server/index.js";

/* Remix's Express template, with the user's session at hand before Remix's handler. */
const app = express();
app.use(compression());
app.disable("x-powered-by");
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(requestContext());
app.all("*", createRequestHandler({ build }));

const port = Number(process.env.PORT);
app.listen(port, "127.0.0.1", () => console.log(`Listening on http://127.0.0.1:${port}`));
