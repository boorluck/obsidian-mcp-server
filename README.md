# obsidian-mcp-server

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-blue.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP_SDK-1.10.2-green.svg)](https://modelcontextprotocol.io/)
[![Obsidian Local REST API](https://img.shields.io/badge/Requires-Obsidian_Local_REST_API-purple.svg)](https://github.com/coddingtonbear/obsidian-local-rest-api)
[![Version](https://img.shields.io/badge/Version-1.1.1-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/casey/obsidian-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/casey/obsidian-mcp-server?style=social)](https://github.com/casey/obsidian-mcp-server)

**Connect your AI models to your Obsidian vault!**

This [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server acts as a bridge between MCP-compatible host applications (like AI assistants) and your Obsidian vault. It leverages the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) to expose core vault operations as MCP tools.

Built upon the `mcp-ts-template`, this server provides a secure and reliable way to read, write, list, and modify files within your Obsidian vault programmatically.

## 📋 Table of Contents

[Features](#-key-features) | [Prerequisites](#-prerequisites) | [Quick Start](#-quick-start) | [Available Tools](#️-available-tools) | [Architecture](#️-architecture) | [Configuration](#️-configuration-environment-variables) | [Project Structure](#️-project-structure) | [More MCP Resources](#-explore-more-mcp-resources) | [License](#-license)

## ✨ Key Features

| Feature Category              | Description                                                                                                                                                                                                                                                           |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 💎 **Obsidian Integration**   | Interact directly with your Obsidian vault using MCP tools.                                                                                                                                                                                                           |
| 🔧 **Core Vault Operations**  | Provides tools for reading (`obsidian_read_file`), updating (`obsidian_update_file`), searching/replacing (`obsidian_search_replace`), listing (`obsidian_list_files`), deleting (`obsidian_delete_file`), and global search (`obsidian_global_search`) across files. |
| ⚡ **Performance (Cache)**    | Includes a background Vault Cache service (`src/services/vaultCache/`) to use as fallback for search tools (like global search) if direct API fails.                                                                                                                  |
| 🚀 **Production Utilities**   | Inherits logging, error handling, ID generation, rate limiting, request context tracking, and input sanitization from the `mcp-ts-template`.                                                                                                                          |
| 🔒 **Type Safety & Security** | Leverages TypeScript and Zod for strong type checking and validation. Includes security utilities and requires authentication for HTTP transport.                                                                                                                     |
| ⚙️ **Robust Error Handling**  | Consistent error categorization and detailed logging for easier debugging.                                                                                                                                                                                            |
| 🔌 **Flexible Transports**    | Supports both `stdio` (for direct integration) and `http` (Streamable SSE) transports.                                                                                                                                                                                |
| 📚 **Clear Documentation**    | Comprehensive guides on usage, configuration, and extension.                                                                                                                                                                                                          |
| 🤖 **Agent Ready**            | Comes with a [.clinerules](.clinerules) file – a developer cheatsheet perfect for LLM coding agents, detailing patterns, file locations, and usage snippets.                                                                                                          |

## ✅ Prerequisites

1.  **Obsidian**: You need Obsidian installed.
2.  **Obsidian Local REST API Plugin**: Install and enable the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) within your Obsidian vault.
3.  **API Key**: Configure an API key within the Local REST API plugin settings in Obsidian. You will need this key to configure the server.
4.  **Node.js & npm**: Ensure you have Node.js (v18 or later recommended) and npm installed.

## 🚀 Quick Start

Get the server running in minutes:

1.  **Clone the repository:**

    ```bash
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
    - **Via Stdio (Default):** Many MCP host applications will run this automatically using `stdio`.
      To run manually for testing:
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

## 🛠️ Available Tools

This server exposes the following MCP tools for interacting with your Obsidian vault:

| Tool Name                 | Description                                                                                                                                 | Implementation Link                                                                                |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------- |
| `obsidian_delete_file`    | Permanently deletes a specified file from the vault. Tries exact path, then case-insensitive fallback.                                      | [src/mcp-server/tools/obsidianDeleteFileTool/](src/mcp-server/tools/obsidianDeleteFileTool/)       |
| `obsidian_global_search`  | Performs search across vault content using text or regex. Supports filtering by modification date.                                          | [src/mcp-server/tools/obsidianGlobalSearchTool/](src/mcp-server/tools/obsidianGlobalSearchTool/)   |
| `obsidian_list_files`     | Lists files and subdirectories within a specified vault folder. Supports filtering by extension or name regex.                              | [src/mcp-server/tools/obsidianListFilesTool/](src/mcp-server/tools/obsidianListFilesTool/)         |
| `obsidian_read_file`      | Retrieves the content and metadata of a specified file. Supports markdown or JSON format. Tries exact path, then case-insensitive fallback. | [src/mcp-server/tools/obsidianReadFileTool/](src/mcp-server/tools/obsidianReadFileTool/)           |
| `obsidian_search_replace` | Performs search-and-replace operations within a target note (file path, active, or periodic). Supports regex, case sensitivity, etc.        | [src/mcp-server/tools/obsidianSearchReplaceTool/](src/mcp-server/tools/obsidianSearchReplaceTool/) |
| `obsidian_update_file`    | Modifies notes using whole-file operations: 'append', 'prepend', or 'overwrite'. Can create missing files/targets.                          | [src/mcp-server/tools/obsidianUpdateFileTool/](src/mcp-server/tools/obsidianUpdateFileTool/)       |

Refer to the tool implementation directories and the [.clinerules](.clinerules) cheatsheet for detailed input schemas and usage patterns.

## 🏗️ Architecture

This server acts as an intermediary, translating MCP requests into Obsidian Local REST API calls.

1.  **Host Application**: Connects to the Obsidian MCP Server via an MCP Client.
2.  **MCP Client**: Sends MCP requests (e.g., `tools/call` for `obsidian_read_file`) over the chosen transport (`stdio` or `http`).
3.  **Obsidian MCP Server**:
    - Receives the MCP request.
    - Validates the request and arguments using Zod schemas.
    - Uses the `ObsidianRestApiService` (and potentially `VaultCacheService`) to interact with the Obsidian Local REST API or cached data.
4.  **ObsidianRestApiService / VaultCacheService**:
    - Constructs the appropriate HTTP request for the Obsidian Local REST API (e.g., `GET /vault/MyNote.md`) or retrieves data from the cache.
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

## ⚙️ Configuration (Environment Variables)

Configure the Obsidian MCP server's behavior using these environment variables (e.g., in a `.env` file):

| Variable                  | Description                                                                                                | Required            | Default             |
| :------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------ | :------------------ |
| **`OBSIDIAN_API_KEY`**    | API Key generated by the Obsidian Local REST API plugin.                                                   | **Yes**             | `undefined`         |
| **`OBSIDIAN_BASE_URL`**   | Base URL of your Obsidian Local REST API (e.g., `http://127.0.0.1:27123`).                                 | **Yes**             | `undefined`         |
| `OBSIDIAN_VERIFY_SSL`     | Set to `false` to disable SSL certificate verification for the Obsidian API (e.g., for self-signed certs). | No                  | `true`              |
| `MCP_TRANSPORT_TYPE`      | Server transport: `stdio` or `http`.                                                                       | No                  | `stdio`             |
| `MCP_HTTP_PORT`           | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                                   | No (if `stdio`)     | `3010`              |
| `MCP_HTTP_HOST`           | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                           | No (if `stdio`)     | `127.0.0.1`         |
| `MCP_ALLOWED_ORIGINS`     | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`). **Set for production.**           | No (if `stdio`)     | (none)              |
| **`MCP_AUTH_SECRET_KEY`** | Secret key (min 32 chars) for signing/verifying auth tokens (JWT). **Required for `http` transport.**      | **Yes (if `http`)** | `undefined`         |
| `MCP_LOG_LEVEL`           | Server logging level (`debug`, `info`, `warning`, `error`, etc.).                                          | No                  | `info`              |
| `MCP_SERVER_NAME`         | Optional server name (used in MCP initialization).                                                         | No                  | (from package.json) |
| `MCP_SERVER_VERSION`      | Optional server version (used in MCP initialization).                                                      | No                  | (from package.json) |
| `NODE_ENV`                | Runtime environment (`development`, `production`).                                                         | No                  | `development`       |

**Note on HTTP Port Retries:** If the `MCP_HTTP_PORT` is busy, the server automatically tries the next port (up to 15 times).

## 🏗️ Project Structure

The `src/` directory is organized for clarity:

| Directory                   | Description                                                                                              |
| :-------------------------- | :------------------------------------------------------------------------------------------------------- |
| `config/`                   | Loads environment variables (`.env`), package info, and Obsidian API settings.                           |
| `mcp-server/`               | Logic for the MCP server provided by this template.                                                      |
| `mcp-server/server.ts`      | Initializes the server, instantiates `ObsidianRestApiService`, registers tools/resources.                |
| `mcp-server/tools/`         | Implementations for each Obsidian MCP tool (e.g., `obsidianReadFileTool/`, `obsidianGlobalSearchTool/`). |
| `mcp-server/transports/`    | Handles `stdio` and `http` communication layers, including HTTP authentication middleware.               |
| `services/`                 | Contains service abstractions for external APIs or internal caching.                                     |
| `services/obsidianRestAPI/` | Typed client for the Obsidian Local REST API (Service, Methods, Types).                                  |
| `services/vaultCache/`      | Service for caching vault structure/metadata (optional, background-built).                               |
| `types-global/`             | Shared TypeScript definitions (Errors, MCP types).                                                       |
| `utils/`                    | Reusable utilities (logging, errors, security, parsing, etc.). Exported via `index.ts`.                  |
| `scripts/`                  | Utility scripts for development (clean, build steps, tree generation, spec fetching).                    |
| `docs/`                     | Documentation files, including generated file tree and fetched API specs.                                |

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
