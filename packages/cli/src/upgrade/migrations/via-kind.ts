import { isNode } from "../codemod/ast";
import { closureKinds, viaCalls } from "../codemod/via-closures";
import type { Finding, Migration, TextEdit } from "../migration";

/* .reads() as it follows .via(), nothing but spaces between: what goes with it. */
const READS = /^\s*\.\s*reads\s*\(\s*\)$/;
const READS_NOW =
  "its closure calls a reading verb, so the endpoint reads, where 0.4 took it for a write: retried, cacheable and taken by useQuery in place of useMutation; one whose call changes something is declared a write";
const BOTH_KINDS =
  "its closure calls a reading verb and a writing one, so the endpoint, a write until now, names its kind: a group refuses it until it does";

/**
 * 0.5.0: an endpoint addressed with `.via()` reads or writes as the verb
 * its closure calls does. After a closure that calls reading verbs alone,
 * the `.reads()` 0.4 needed changes nothing, and goes. An endpoint that
 * names no kind is found where its closure calls a reading verb, which
 * makes it a read, and where it calls verbs of both kinds, which leaves
 * it no endpoint until it names one.
 */
export const VIA_KIND: Migration = {
  id: "0.5.0/via-kind",
  title: "drops the .reads() a .via() closure's reading verb says already",
  mentions: ["via"],
  migrate(file) {
    const edits: TextEdit[] = [];
    const findings: Finding[] = [];
    for (const { call, closure, after, goesOn } of viaCalls(file.program)) {
      const kinds = closureKinds(closure);
      if (kinds === undefined) continue;
      const reads = kinds.size === 1 && kinds.has("query");
      const [next] = after;
      if (reads && next?.name === "reads") {
        if (READS.test(file.text.slice(call.end, next.call.end)))
          edits.push({ start: call.end, end: next.call.end, text: "" });
        continue;
      }
      if (goesOn || after.some(({ name }) => name === "reads" || name === "writes")) continue;
      const { callee } = call;
      const at = isNode(callee) && isNode(callee.property) ? callee.property.start : call.start;
      if (kinds.size > 1)
        findings.push({
          at,
          what: BOTH_KINDS,
          instead: [".via(…).reads()", ".via(…).writes()"],
        });
      else if (reads) findings.push({ at, what: READS_NOW, instead: [".via(…).writes()"] });
    }
    return { edits, findings, packages: [] };
  },
};
