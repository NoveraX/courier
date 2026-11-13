/**
 * Courier's block in a project's AGENTS.md, which points the agent in its
 * editor at the docs of the Courier it installs: the block between its
 * markers; writing it in, as `create-courier` and `courier-cli setup` do
 * once the person agrees — at the file's end, or in place of the one
 * there; and only bringing it up to date, as Studio does as it starts and
 * the upgrade does, in a file that holds it and between its markers alone.
 * One module holds the text and the rules, so the commands and Studio
 * never write two blocks. It is Courier's own, not a public API.
 */
export {
  AGENT_FILE_MAX_BYTES,
  type AgentFile,
  type AgentFilePurpose,
  readAgentFile,
} from "./agent-file";
export {
  AGENT_RULES,
  AGENT_RULES_BEGIN,
  AGENT_RULES_END,
  agentRulesProblem,
  updatedAgentRules,
  withAgentRules,
} from "./rules-text";
export { type AgentRulesUpdate, updateAgentRules } from "./update-agent-rules";
