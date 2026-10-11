/**
 * A language model that runs on this machine and answers nothing. VS Code
 * hands a chat request to a participant only once a model is picked, and
 * every model it offers otherwise needs an account; @courier's commands,
 * which the editor shots show, answer from Studio without asking a model.
 */
const vscode = require("vscode");

/**
 * Offer the model.
 *
 * @param {import("vscode").ExtensionContext} context - The extension's context
 */
exports.activate = (context) => {
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider("courier-shots", {
      provideLanguageModelChatInformation: async () => [
        {
          id: "local",
          name: "Local",
          family: "local",
          version: "1",
          maxInputTokens: 100_000,
          maxOutputTokens: 1_000,
          capabilities: {},
        },
      ],
      provideLanguageModelChatResponse: async (_model, _messages, _options, progress) => {
        progress.report(new vscode.LanguageModelTextPart("This local model answers nothing."));
      },
      provideTokenCount: async () => 1,
    }),
  );
};
