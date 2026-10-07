import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { requestContext } from "@noverax/courier-nestjs";

import { AppModule } from "./app.module.js";

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  logger: ["error", "warn"],
});
app.use(requestContext());
const port = Number(process.env.PORT);
await app.listen(port, "127.0.0.1");
console.log(`Listening on http://127.0.0.1:${port}`);
