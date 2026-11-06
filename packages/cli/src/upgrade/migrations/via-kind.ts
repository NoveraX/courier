import { isNode } from "../codemod/ast";
import { closureKinds, viaCalls } from "../codemod/via-closures";
import type { Finding, Migration, TextEdit } from "../migration";

/* .reads() as it follows .via(), nothing but spaces between: what goes with it. */
const READS = /^\s*\.\s*reads\s*\(\s*\)$/;
const READS_NOW =
  "its closure calls a reading verb, so the endpoint reads, where 0.4 took it for a write: retried, cacheable and taken by useQuery in place of useMutation; one whose call changes something is declared a write";

/**
 * 0.5.0: an endpoint addressed with `.via()` reads or writes as the verb
 * its closure calls does, where 0.4 took every one for a write until
 * `.reads()` said otherwise. After a closure that calls reading verbs
 * alone, the `.reads()` 0.4 needed changes nothing, and goes; one that
 * calls verbs of both kinds and names none is declared the write 0.4 took
 * it for. One that calls reading verbs alone and names no kind is found:
 * it reads now, and only the person knows whether its call changes
 * something.
 */
export const VIA_KIND: Migration = {
  id: "0.5.0/via-kind",
  title: "keeps a .via() endpoint the kind 0.4 gave it, in 0.5's terms",
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
      if (kinds.size > 1) {
        edits.push({ start: call.end, end: call.end, text: ".writes()" });
        continue;
      }
      const { callee } = call;
      const at = isNode(callee) && isNode(callee.property) ? callee.property.start : call.start;
      if (reads) findings.push({ at, what: READS_NOW, instead: [".via(…).writes()"] });
    }
    return { edits, findings, packages: [] };
  },
};
