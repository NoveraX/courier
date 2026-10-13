/**
 * Run inside a fresh Node: one API's answers served by Node's own HTTP
 * server and nothing else — the floor the mocks are held to on the machine
 * that measures them. Each request gets the work any JSON server does — its
 * body parsed, its answer serialized — and an answer of the same shape and
 * size as a mock's: a page of twenty records for a list or a search, one
 * record for the rest. Prints `listening` once it does.
 */
import { createServer } from "node:http";
import { argv } from "node:process";

import { enterpriseModel } from "../fixture/model.mjs";
import { sampleRecord } from "./sample-record.mjs";

const [endpoints = "1000", source = "0", port = "0"] = argv.slice(2);
const { groups = [] } =
  enterpriseModel({ endpoints: Number(endpoints) }).sources[Number(source)] ?? {};
const fieldsOf = new Map(groups.map((group) => [group.name, group.fields]));

const server = createServer((req, res) => {
  const [group = "", rest = ""] = (req.url ?? "/").split("?")[0].slice(1).split("/");
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const fields = fieldsOf.get(group);
    if (!fields) {
      res.writeHead(404).end();
      return;
    }
    const sent = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const page = (rest === "" && req.method === "GET") || rest === "search";
    const answer = page
      ? Array.from({ length: 20 }, (_, at) => sampleRecord(fields, `id-${at + 1}`))
      : { ...sampleRecord(fields, rest || "id-new"), ...sent };
    res
      .writeHead(req.method === "POST" ? 201 : 200, { "content-type": "application/json" })
      .end(JSON.stringify(answer));
  });
});
server.listen(Number(port), "127.0.0.1", () => console.log("listening"));
