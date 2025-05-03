# Obsidian MCP Server  Obsidian Logo 💎

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP_SDK-1.10.2-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.1.1-blue.svg)](./CHANGELOG.md) <!-- TODO: Update version if needed -->
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/casey/obsidian-mcp-server/issues) <!-- TODO: Update repo link -->
[![GitHub](https://img.shields.io/github/stars/casey/obsidian-mcp-server?style=social)](https://github.com/casey/obsidian-mcp-server) <!-- TODO: Update repo link -->

**Connect your AI models to your Obsidian vault!**

This [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server acts as a bridge between MCP-compatible host applications (like AI assistants) and your Obsidian vault. It leverages the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) to expose core vault operations as MCP tools.

Built upon the robust `mcp-ts-template`, this server provides a secure and reliable way to read, write, list, and modify files within your Obsidian vault programmatically.

## ✨ Key Features

- **💎 Obsidian Integration**: Interact directly with your Obsidian vault using MCP tools.
- **🔧 Core Vault Operations**: Provides tools for:
    - Reading files (`obsidian_read_file`)
    - Updating files (`obsidian_update_file` - append, prepend, overwrite)
    - Searching and replacing within files (`obsidian_search_replace`)
    - Listing files and directories (`obsidian_list_files`)
    - Deleting files (`obsidian_delete_file`)
- **🚀 Production-Ready Utilities**: Inherits logging, error handling, ID generation, rate limiting, request context tracking, and input sanitization from the `mcp-ts-template`.
- **🔒 Type Safety & Security**: Leverages TypeScript and Zod for strong type checking and validation. Includes security utilities and requires authentication for HTTP transport.
- **⚙️ Robust Error Handling**: Consistent error categorization and detailed logging for easier debugging.
- **🔌 Flexible Transports**: Supports both `stdio` (for direct integration) and `http` (Streamable SSE) transports.
- **📚 Clear Documentation**: Comprehensive guides on usage, configuration, and extension.
- **🤖 Agent Ready**: Comes with a [.clinerules](.clinerules) file – a developer cheatsheet perfect for LLM coding agents, detailing patterns, file locations, and usage snippets.

## 📋 Table of Contents

[Features](#key-features) | [Prerequisites](#prerequisites) | [Quick Start](#quick-start) | [Configuration](#configuration) | [Available Tools](#available-tools) | [Architecture](#architecture) | [Adding Tools/Resources](#adding-your-own-tools--resources) | [Project Structure](#project-structure) | [More MCP Resources](#explore-more-mcp-resources) | [License](#license)

## ✅ Prerequisites

1.  **Obsidian**: You need Obsidian installed.
2.  **Obsidian Local REST API Plugin**: Install and enable the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) within your Obsidian vault.
3.  **API Key**: Configure an API key within the Local REST API plugin settings in Obsidian. You will need this key to configure the server.
4.  **Node.js & npm**: Ensure you have Node.js (v18 or later recommended) and npm installed.

## 🚀 Quick Start

Get the server running in minutes:

1.  **Clone the repository:**
    ```bash
    # TODO: Update with correct repo URL if needed
    git clone https://github.com/casey/obsidian-mcp-server.git
    cd obsidian-mcp-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory or set environment variables directly. See the [Configuration](#configuration) section for details. **Minimally, you MUST set `OBSIDIAN_API_KEY` and `OBSIDIAN_BASE_URL`. For HTTP transport, `MCP_AUTH_SECRET_KEY` is also required.**

4.  **Build the project:**
    ```bash
    npm run build
    # Or use 'npm run rebuild' for a clean install (deletes node_modules, logs, dist)
    ```

5.  **Run the Server:**
    - **Via Stdio (Default):** Many MCP host applications will run this automatically using `stdio`. To run manually for testing:
      ```bash
      npm start
      # or directly: node dist/index.js
      ```
    - **Via HTTP (SSE):**
      ```bash
      npm run start:http
      # or directly: MCP_TRANSPORT_TYPE=http node dist/index.js
      ```
      This starts an HTTP server (default: `http://127.0.0.1:3010`) using Server-Sent Events. Ensure `MCP_AUTH_SECRET_KEY` is set. The port, host, and allowed origins are configurable via environment variables.

## ⚙️ Configuration (Environment Variables)

Configure the Obsidian MCP server's behavior using these environment variables (e.g., in a `.env` file):

| Variable                | Description                                                                                                | Required                     | Default             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------- |
| **`OBSIDIAN_API_KEY`**  | API Key generated by the Obsidian Local REST API plugin.                                                   | **Yes**                      | `undefined`         |
| **`OBSIDIAN_BASE_URL`** | Base URL of your Obsidian Local REST API (e.g., `http://127.0.0.1:27123`).                                  | **Yes**                      | `undefined`         |
| `OBSIDIAN_VERIFY_SSL`   | Set to `false` to disable SSL certificate verification for the Obsidian API (e.g., for self-signed certs). | No                           | `true`              |
| `MCP_TRANSPORT_TYPE`    | Server transport: `stdio` or `http`.                                                                       | No                           | `stdio`             |
| `MCP_HTTP_PORT`         | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                                   | No (if `stdio`)              | `3010`              |
| `MCP_HTTP_HOST`         | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                           | No (if `stdio`)              | `127.0.0.1`         |
| `MCP_ALLOWED_ORIGINS`   | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`). **Set for production.**           | No (if `stdio`)              | (none)              |
| **`MCP_AUTH_SECRET_KEY`** | Secret key (min 32 chars) for signing/verifying auth tokens (JWT). **Required for `http` transport.**      | **Yes (if `http`)**          | `undefined`         |
| `MCP_LOG_LEVEL`         | Server logging level (`debug`, `info`, `warning`, `error`, etc.).                                          | No                           | `info`              |
| `MCP_SERVER_NAME`       | Optional server name (used in MCP initialization).                                                         | No                           | (from package.json) |
| `MCP_SERVER_VERSION`    | Optional server version (used in MCP initialization).                                                      | No                           | (from package.json) |
| `NODE_ENV`              | Runtime environment (`development`, `production`).                                                         | No                           | `development`       |

**Note on HTTP Port Retries:** If the `MCP_HTTP_PORT` is busy, the server automatically tries the next port (up to 15 times).

## 🛠️ Available Tools

This server exposes the following MCP tools for interacting with your Obsidian vault:

| Tool Name                   | Description                                                                                                                               | Implementation                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `obsidian_delete_file`      | Permanently deletes a specified file from the vault. Tries exact path, then case-insensitive fallback.                                    | [src/mcp-server/tools/obsidianDeleteFileTool/](src/mcp-server/tools/obsidianDeleteFileTool/) |
| `obsidian_list_files`       | Lists files and subdirectories within a specified vault folder. Supports filtering by extension or name regex.                            | [src/mcp-server/tools/obsidianListFilesTool/](src/mcp-server/tools/obsidianListFilesTool/) |
| `obsidian_read_file`        | Retrieves the content and metadata of a specified file. Supports markdown or JSON format. Tries exact path, then case-insensitive fallback. | [src/mcp-server/tools/obsidianReadFileTool/](src/mcp-server/tools/obsidianReadFileTool/) |
| `obsidian_search_replace`   | Performs search-and-replace operations within a target note (file path, active, or periodic). Supports regex, case sensitivity, etc.      | [src/mcp-server/tools/obsidianSearchReplaceTool/](src/mcp-server/tools/obsidianSearchReplaceTool/) |
| `obsidian_update_file`      | Modifies notes using whole-file operations: 'append', 'prepend', or 'overwrite'. Can create missing files/targets.                          | [src/mcp-server/tools/obsidianUpdateFileTool/](src/mcp-server/tools/obsidianUpdateFileTool/) |

Refer to the tool implementation directories and the [.clinerules](.clinerules) cheatsheet for detailed input schemas and usage patterns.

## 🏗️ Architecture

This server acts as an intermediary, translating MCP requests into Obsidian Local REST API calls.

```mermaid
graph LR
    subgraph "Host Application (e.g., VS Code)"
        H[Host] --> C[Client]
    end
    subgraph "Obsidian MCP Server Process"
        S[Obsidian MCP Server]
        OAS[ObsidianRestApiService]
        S --> OAS
    end
    subgraph "Obsidian Application"
        OLR[Local REST API Plugin]
        OV[Obsidian Vault]
        OLR <--> OV
    end
    C <-->|MCP Protocol (Stdio/HTTP)| S
    OAS <-->|HTTP API Calls| OLR
```

1.  **Host Application**: Connects to the Obsidian MCP Server via an MCP Client.
2.  **MCP Client**: Sends MCP requests (e.g., `tools/call` for `obsidian_read_file`) over the chosen transport (`stdio` or `http`).
3.  **Obsidian MCP Server**:
    - Receives the MCP request.
    - Validates the request and arguments using Zod schemas.
    - Uses the `ObsidianRestApiService` to interact with the Obsidian Local REST API.
4.  **ObsidianRestApiService**:
    - Constructs the appropriate HTTP request for the Obsidian Local REST API (e.g., `GET /vault/MyNote.md`).
    - Adds the `Authorization` header with the `OBSIDIAN_API_KEY`.
    - Sends the request to the `OBSIDIAN_BASE_URL`.
5.  **Obsidian Local REST API Plugin**:
    - Receives the HTTP request.
    - Performs the requested action within the Obsidian Vault (e.g., reads `MyNote.md`).
    - Sends the HTTP response back to the `ObsidianRestApiService`.
6.  **Obsidian MCP Server**:
    - Receives the response from the service.
    - Formats the result into an MCP response message (e.g., `CallToolResult`).
    - Sends the MCP response back to the Client.
7.  **Host Application**: Receives the result and presents it to the user or AI model.

## 🧩 Adding Your Own Tools & Resources

This template is designed for extension! While focused on Obsidian, you can add other tools or resources.

1.  **Create Directories**: Add new directories under `src/mcp-server/tools/yourToolName/` or `src/mcp-server/resources/yourResourceName/`.
2.  **Implement Logic (`logic.ts`)**: Define Zod schemas for inputs/outputs and write your core processing function. If interacting with Obsidian, use the `ObsidianRestApiService` instance passed during registration.
3.  **Register (`registration.ts`)**:
    - **Tools**: Use `server.tool(name, description, zodSchemaShape, handler)` (SDK v1.10.2+). This handles schema generation, validation, and routing. Pass the `obsidianService` instance to your handler if needed.
    - **Resources**: Use `server.resource(regName, template, metadata, handler)`.
    - Wrap logic in `ErrorHandler.tryCatch` for robust error handling.
4.  **Export & Import**: Export the registration function from your new directory's `index.ts` and call it within `createMcpServerInstance` in `src/mcp-server/server.ts`, passing the `obsidianService` instance.

Refer to the included Obsidian tool examples and the [.clinerules](.clinerules) cheatsheet for detailed patterns.

## 🏗️ Project Structure

The `src/` directory is organized for clarity:

- `config/`: Loads environment variables (`.env`), package info, and Obsidian API settings.
- `mcp-server/`: Logic for the MCP server provided by this template.
  - `server.ts`: Initializes the server, instantiates `ObsidianRestApiService`, registers tools/resources.
  - `tools/`: Implementations for each Obsidian MCP tool (e.g., `obsidianReadFileTool/`).
    - `index.ts`: Exports the registration function.
    - `logic.ts`: Defines Zod schema and the core tool logic.
    - `registration.ts`: Registers the tool with the MCP server using `server.tool()`.
  - `transports/`: Handles `stdio` and `http` communication layers, including HTTP authentication middleware.
- `services/`: Contains service abstractions for external APIs.
  - `obsidianRestAPI/`: Typed client for the Obsidian Local REST API.
    - `service.ts`: Main service class using Axios.
    - `methods/`: Functions implementing specific API calls.
    - `types.ts`: TypeScript interfaces for API requests/responses.
- `types-global/`: Shared TypeScript definitions (Errors, MCP types).
- `utils/`: Reusable utilities (logging, errors, security, parsing, etc.). Exported via `index.ts`.

**Explore the structure yourself:**

```bash
npm run tree
```

(This uses `scripts/tree.ts` to generate a current file tree in `docs/tree.md`.)

## 🌍 Explore More MCP Resources

Looking for more examples, guides, and pre-built MCP servers? Check out the companion repository:

➡️ **[cyanheads/model-context-protocol-resources](https://github.com/cyanheads/model-context-protocol-resources)**

This collection includes servers for Filesystem, Git, GitHub, Perplexity, Atlas, Ntfy, and more, along with in-depth guides based on real-world MCP development.

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️, TypeScript, and the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
