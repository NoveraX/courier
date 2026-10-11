# Your API, as your agent's tools

VS Code's agent finds Courier's servers on its own: nothing to write in `.vscode/mcp.json`. Each project of the workspace offers the ones it has installed.

| Server | Offered when the project has | What the agent gets |
| --- | --- | --- |
| **Courier API** | `@noverax/courier-mcp` | The endpoints marked `.agent()`, and those the `agents` policy in `courier.config` offers |
| **Courier Studio** | `@noverax/courier-studio` | The requests Studio recorded, its audit, its mocks and their scenarios |

Install the API's server:

```bash
npm install -D @noverax/courier-mcp
```

The API's server loads the project's `.env.development.local`, `.env.local`, `.env.development` and `.env` — those that exist — so its calls reach your backend. The `courier.agents.mcpServers` setting turns the servers off.
