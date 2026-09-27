const { COMMIT_RULES, TYPE_EMOJI, isGitWritten } = require("./scripts/commit-rules.cjs");

module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: COMMIT_RULES }],
  defaultIgnores: false,
  ignores: [isGitWritten],
  rules: {
    "type-enum": [2, "always", [...TYPE_EMOJI.keys()]],
    "header-max-length": [0],
    "header-max-characters": [2, "always", 72],
    "subject-type-emoji": [2, "always"],
    "body-no-label-lines": [2, "always"],
    "footer-max-line-length": [0],
    "body-max-line-length": [0],
  },
};
