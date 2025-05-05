# Obsidian MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-blue.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP_SDK-^1.11.0-green.svg)](https://modelcontextprotocol.io/)
[![Obsidian Local REST API](https://img.shields.io/badge/Requires-Obsidian_Local_REST_API-purple.svg)](https://github.com/coddingtonbear/obsidian-local-rest-api)
[![Version](https://img.shields.io/badge/Version-1.1.1-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/casey/obsidian-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/casey/obsidian-mcp-server?style=social)](https://github.com/casey/obsidian-mcp-server)

**Connect your AI models to your Obsidian vault!**
An MCP (Model Context Protocol) server providing tools to interact with your Obsidian vault. Enables LLMs and AI agents to perform vault operations like reading, writing, searching, and listing files via the MCP standard, leveraging the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api).

Built on the [`cyanheads/mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template), this server follows a modular architecture:

> **Note:** This server requires the Obsidian Local REST API plugin to be installed and configured in your Obsidian vault.

Implemented as an MCP server, it allows LLM agents and other compatible clients to interact with your Obsidian vault using standardized commands.

> **Developer Note**: This repository includes a [.clinerules](.clinerules) file that serves as a developer cheat sheet for your LLM coding agent with quick reference for the codebase patterns, file locations, and code snippets.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Tools](#tools)
- [Resources](#resources)
- [Development](#development)
- [License](#license)

## Overview

**Empower your AI agents and development tools with seamless Obsidian integration!**

The Obsidian MCP Server acts as a bridge, allowing applications (MCP Clients) that understand the Model Context Protocol (MCP) – like advanced AI assistants (LLMs), IDE extensions, or custom scripts – to interact directly and safely with your Obsidian vault.

Instead of complex scripting or manual interaction, your tools can leverage this server to:

- **Automate vault management**: Read notes, update content, search across files, list directories, and delete files programmatically.
- **Integrate Obsidian into AI workflows**: Enable LLMs to access and modify your knowledge base as part of their research, writing, or coding tasks.
- **Build custom Obsidian tools**: Create external applications that interact with your vault data in novel ways.

Built on the robust `mcp-ts-template`, this server provides a standardized, secure, and efficient way to expose Obsidian functionality via the MCP standard. It achieves this by communicating with the powerful [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) running inside your vault.

## Features

### Core Utilities (from Template)

Leverages the robust utilities provided by the `mcp-ts-template`:

- **Logging**: Structured, configurable logging (file rotation, console, MCP notifications) with sensitive data redaction.
- **Error Handling**: Centralized error processing, standardized error types (`McpError`), and automatic logging.
- **Configuration**: Environment variable loading (`dotenv`).
- **Input Validation/Sanitization**: Uses `zod` for schema validation and custom sanitization logic.
- **Request Context**: Tracking and correlation of operations via unique request IDs.
- **Type Safety**: Strong typing enforced by TypeScript and Zod schemas.
- **HTTP Transport Option**: Built-in Express server with SSE, session management, and CORS support.

### Obsidian Operations

- **Obsidian Local REST API Integration**: Communicates directly with the Obsidian Local REST API plugin via HTTP requests managed by the `ObsidianRestApiService`.
- **Comprehensive Command Coverage**: Exposes key vault operations as MCP tools (see [Tools](#tools) section).
- **Vault Interaction**: Supports reading, updating (append, prepend, overwrite), searching (global text/regex, search/replace), listing, and deleting files.
- **Targeting Flexibility**: Tools can target files by path, the currently active file in Obsidian, or periodic notes (daily, weekly, etc.).
- **Performance Cache**: Includes an optional `VaultCacheService` to cache vault structure, potentially speeding up list/search operations and providing fallback.
- **Safety Features**: Case-insensitive path fallbacks for file operations, clear distinction between modification types (append, overwrite, etc.).

## Installation

### Prerequisites

1.  **Obsidian**: You need Obsidian installed.
2.  **Obsidian Local REST API Plugin**: Install and enable the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) within your Obsidian vault.
3.  **API Key**: Configure an API key within the Local REST API plugin settings in Obsidian. You will need this key to configure the server.
4.  **Node.js & npm**: Ensure you have Node.js (v18 or later recommended) and npm installed.

### Install from Source

1.  Clone the repository:
    ```bash
    git clone https://github.com/casey/obsidian-mcp-server.git
    cd obsidian-mcp-server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```
    This compiles the TypeScript code to JavaScript in the `dist/` directory and makes the entry point executable.

## Configuration

### Environment Variables

Configure the server using environment variables. Create a `.env` file in the project root (copy from `env.json` or `.env.example` if available) or set them in your environment.

| Variable                  | Description                                                                                                | Required            | Default             |
| :------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------ | :------------------ |
| **`OBSIDIAN_API_KEY`**    | API Key generated by the Obsidian Local REST API plugin.                                                   | **Yes**             | `undefined`         |
| **`OBSIDIAN_BASE_URL`**   | Base URL of your Obsidian Local REST API (e.g., `http://127.0.0.1:27123`).                                 | **Yes**             | `undefined`         |
| `OBSIDIAN_VERIFY_SSL`     | Set to `false` to disable SSL certificate verification for the Obsidian API (e.g., for self-signed certs). | No                  | `true`              |
| `MCP_TRANSPORT_TYPE`      | Server transport: `stdio` or `http`.                                                                       | No                  | `stdio`             |
| `MCP_HTTP_PORT`           | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`). Retries next ports if busy.                       | No (if `stdio`)     | `3010`              |
| `MCP_HTTP_HOST`           | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                           | No (if `stdio`)     | `127.0.0.1`         |
| `MCP_ALLOWED_ORIGINS`     | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`). **Set for production.**           | No (if `stdio`)     | (none)              |
| **`MCP_AUTH_SECRET_KEY`** | Secret key (min 32 chars) for signing/verifying auth tokens (JWT). **Required for `http` transport.**      | **Yes (if `http`)** | `undefined`         |
| `MCP_LOG_LEVEL`           | Server logging level (`debug`, `info`, `notice`, `warning`, `error`, `crit`, `alert`, `emerg`).            | No                  | `info`              |
| `MCP_SERVER_NAME`         | Optional server name (used in MCP initialization).                                                         | No                  | (from package.json) |
| `MCP_SERVER_VERSION`      | Optional server version (used in MCP initialization).                                                      | No                  | (from package.json) |
| `NODE_ENV`                | Runtime environment (`development`, `production`).                                                         | No                  | `development`       |

**Note on HTTP Port Retries:** If the `MCP_HTTP_PORT` is busy, the server automatically tries the next port (up to 15 times).

### MCP Client Settings

Add to your MCP client settings (e.g., `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node", // Use node to run the script
      "args": ["/path/to/your/obsidian-mcp-server/dist/index.js"], // Absolute path to the built entry point
      "env": {
        "OBSIDIAN_API_KEY": "YOUR_OBSIDIAN_API_KEY",
        "OBSIDIAN_BASE_URL": "http://127.0.0.1:27123" // Adjust if needed
        // "MCP_TRANSPORT_TYPE": "http", // Optional: if using http
        // "MCP_HTTP_PORT": "3011",      // Optional: if using http and non-default port
        // "MCP_AUTH_SECRET_KEY": "YOUR_SECRET_KEY_FOR_HTTP" // Required if using http
      },
      "disabled": false,
      "autoApprove": [] // Configure auto-approval rules if desired
    }
  }
}
```

## Project Structure

The codebase follows a modular structure within the `src/` directory:

```
src/
├── index.ts           # Entry point: Initializes and starts the server
├── config/            # Configuration loading (env vars, package info)
│   └── index.ts
├── mcp-server/        # Core MCP server logic and capability registration
│   ├── server.ts      # Server setup, transport handling, tool/resource registration
│   ├── resources/     # MCP Resource implementations (currently none)
│   ├── tools/         # MCP Tool implementations (subdirs per tool)
│   └── transports/    # Stdio and HTTP transport logic, auth middleware
├── services/          # Abstractions for external APIs or internal caching
│   ├── obsidianRestAPI/ # Typed client for Obsidian Local REST API
│   └── vaultCache/    # Service for caching vault structure
├── types-global/      # Shared TypeScript type definitions (errors, etc.)
└── utils/             # Common utility functions (logger, error handler, security, etc.)
```

For a detailed file tree, run `npm run tree` or see [docs/tree.md](docs/tree.md).

## Tools

The Obsidian MCP Server provides a suite of tools for interacting with your vault, callable via the Model Context Protocol.

| Tool Name                 | Description                                                                                                                                 | Implementation Link                                                                                |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------- |
| `obsidian_delete_file`    | Permanently deletes a specified file from the vault. Tries exact path, then case-insensitive fallback.                                      | [src/mcp-server/tools/obsidianDeleteFileTool/](src/mcp-server/tools/obsidianDeleteFileTool/)       |
| `obsidian_global_search`  | Performs search across vault content using text or regex. Supports filtering by modification date, path, pagination, and limiting matches per file. | [src/mcp-server/tools/obsidianGlobalSearchTool/](src/mcp-server/tools/obsidianGlobalSearchTool/)   |
| `obsidian_list_files`     | Lists files and subdirectories within a specified vault folder. Supports filtering by extension or name regex.                              | [src/mcp-server/tools/obsidianListFilesTool/](src/mcp-server/tools/obsidianListFilesTool/)         |
| `obsidian_read_file`      | Retrieves the content and metadata of a specified file. Supports markdown or JSON format. Tries exact path, then case-insensitive fallback. | [src/mcp-server/tools/obsidianReadFileTool/](src/mcp-server/tools/obsidianReadFileTool/)           |
| `obsidian_search_replace` | Performs search-and-replace operations within a target note (file path, active, or periodic). Supports regex, case sensitivity, etc.        | [src/mcp-server/tools/obsidianSearchReplaceTool/](src/mcp-server/tools/obsidianSearchReplaceTool/) |
| `obsidian_update_file`    | Modifies notes using whole-file operations: 'append', 'prepend', or 'overwrite'. Can create missing files/targets.                          | [src/mcp-server/tools/obsidianUpdateFileTool/](src/mcp-server/tools/obsidianUpdateFileTool/)       |

Refer to the tool implementation directories and the [.clinerules](.clinerules) cheatsheet for detailed input schemas and usage patterns.

## Resources

**MCP Resources are not implemented in this version.**

This server currently focuses on providing interactive tools for vault manipulation. Future development may introduce resource capabilities (e.g., exposing notes or search results as readable resources).

## Development

### Build and Test

```bash
# Build the project (compile TS to JS in dist/ and make executable)
npm run build

# Watch for changes and recompile automatically (if nodemon/similar is configured)
# npm run watch # (Add this script to package.json if needed)

# Test the server locally using stdio transport
npm start
# or specifically:
npm run start:stdio

# Test the server locally using http transport
npm run start:http

# Clean build artifacts (runs scripts/clean.ts)
# npm run clean # (Add this script to package.json if needed)

# Generate a file tree representation for documentation (runs scripts/tree.ts)
npm run tree

# Clean build artifacts and then rebuild the project
npm run rebuild

# Fetch the Obsidian API spec (requires Obsidian running with Local REST API)
npm run fetch:spec http://127.0.0.1:27123/ docs/obsidian-api/obsidian_rest_api_spec
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️, TypeScript, and the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
