/**
 * Commit-message rules the convention needs beyond
 * `@commitlint/config-conventional`: the emoji each type carries, a header
 * limit counted in characters as they are seen, a body free of lines the
 * Conventional Commits grammar reads as footers, and the messages git itself
 * writes, which are exempt.
 */

/** The emoji each commit type carries between the colon and the description. */
const TYPE_EMOJI = new Map([
  ["feat", "✨"],
  ["fix", "🐛"],
  ["docs", "📝"],
  ["style", "🎨"],
  ["refactor", "♻️"],
  ["perf", "⚡"],
  ["test", "✅"],
  ["build", "📦"],
  ["ci", "👷"],
  ["chore", "🔧"],
]);

const VARIATION_SELECTOR = /\uFE0F/g;
const FOOTER_LINE = /^(?:BREAKING CHANGE|[\w-]+)(?::\s+|\s+#).+/i;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /;
const TRAILER_LINE =
  /^(?:Co-authored-by|Co-developed-by|Signed-off-by|Reviewed-by|Acked-by|Tested-by|Reported-by|Suggested-by|Helped-by|Change-Id|Link): .+/i;
const REFERENCE_LINE =
  /^(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)(?::\s*|\s+)(?:[\w.-]+\/[\w.-]+)?#\d+/i;
const SCISSORS = /^\S+ -+ >8 -+$/m;
const GIT_WRITTEN =
  /^(?:Merge (?:branch(?:es)?|commit|tags?|remote-tracking branch(?:es)?|pull request) |(?:Revert|Reapply) "|(?:fixup|squash|amend)! )/;
const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Limits the header to `max` characters as a reader sees them. The built-in
 * `header-max-length` counts UTF-16 units, so 🐛 and ♻️ each cost two.
 *
 * @param {{ header?: string | null }} commit - The parsed commit
 * @param {string} _when - Always `"always"`; the rule has no negated form
 * @param {number} max - The largest allowed number of characters
 * @returns {[boolean, string]} Whether the header fits, and the message when not
 * @example
 * headerMaxCharacters({ header: "refactor: ♻️ split the loader" }, "always", 72); // [true, …]
 */
function headerMaxCharacters({ header }, _when = "always", max = 72) {
  const length = [...GRAPHEMES.segment(header ?? "")].length;
  return [length <= max, `header must be at most ${max} characters, it has ${length}`];
}

/**
 * Requires the subject to open with the type's emoji, one space, and a
 * description that starts in lower case. The emoji matches with or without
 * the variation selector that emoji pickers add or leave out. An unknown
 * type passes here and is reported by `type-enum`.
 *
 * @param {{ type?: string | null, subject?: string | null }} commit - The parsed commit
 * @returns {[boolean, string]} Whether the subject conforms, and the message when not
 * @example
 * subjectTypeEmoji({ type: "perf", subject: "⚡️ cache the lookup" }); // [true, …]
 * subjectTypeEmoji({ type: "feat", subject: "🐛 add retries" }); // [false, …]
 */
function subjectTypeEmoji({ type, subject }) {
  const emoji = TYPE_EMOJI.get(type ?? "");
  if (emoji === undefined) return [true, ""];
  const prefix = `${emoji.replace(VARIATION_SELECTOR, "")} `;
  const text = (subject ?? "").replace(VARIATION_SELECTOR, "");
  const description = text.startsWith(prefix) ? text.slice(prefix.length) : "";
  const valid = /^[^\sA-Z]/.test(description);
  return [valid, `subject must be "${emoji} " and then a description in lower case`];
}

function isFooterByDesign(line) {
  return BREAKING_FOOTER.test(line) || TRAILER_LINE.test(line) || REFERENCE_LINE.test(line);
}

/**
 * Rejects a line after the header that the Conventional Commits grammar reads
 * as the start of the footer — a token and `: `, or a token and ` #`, in any
 * case — since a parser following it, commitlint's among them, cuts the body
 * there, and one spelled like a breaking-change note becomes one. The lines
 * meant as footers are allowed wherever they stand, since a squash merge
 * lists each commit's with it: a `BREAKING CHANGE:` note in capitals, an
 * issue reference (`Closes #12`, `Refs: #12`) and the git trailers
 * `Co-authored-by`, `Co-developed-by`, `Signed-off-by`, `Reviewed-by`,
 * `Acked-by`, `Tested-by`, `Reported-by`, `Suggested-by`, `Helped-by`,
 * `Change-Id` and `Link`. Anything after git's scissors line is the diff
 * `commit -v` shows, not the message.
 *
 * @param {{ body?: string | null, footer?: string | null }} commit - The parsed commit
 * @returns {[boolean, string]} Whether the message conforms, and the offending line
 * @example
 * bodyNoLabelLines({ body: "Core: now waits.", footer: null }); // [false, …]
 * bodyNoLabelLines({ body: "Details.", footer: "Closes #12" }); // [true, …]
 */
function bodyNoLabelLines({ body, footer }) {
  const text = [body, footer].filter(Boolean).join("\n\n").split(SCISSORS)[0];
  const offending = text
    .split("\n")
    .find((line) => FOOTER_LINE.test(line) && !isFooterByDesign(line));
  if (offending === undefined) return [true, ""];
  return [false, `"${offending}" starts a footer; reword the line`];
}

/**
 * Tells whether git wrote the message: a merge, a revert or reapply, or a
 * fixup, squash or amend commit meant to be folded away before it lands.
 *
 * @param {string} message - The raw commit message
 * @returns {boolean} `true` when commitlint should skip the message
 * @example
 * isGitWritten('Revert "feat: ✨ add retries"'); // true
 */
function isGitWritten(message) {
  return GIT_WRITTEN.test(message);
}

/** The rules above under the names the commitlint config enables. */
const COMMIT_RULES = {
  "header-max-characters": headerMaxCharacters,
  "subject-type-emoji": subjectTypeEmoji,
  "body-no-label-lines": bodyNoLabelLines,
};

module.exports = {
  TYPE_EMOJI,
  COMMIT_RULES,
  headerMaxCharacters,
  subjectTypeEmoji,
  bodyNoLabelLines,
  isGitWritten,
};
