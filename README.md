# MCP TypeScript Template 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP_SDK-1.10.2-green.svg)](https://modelcontextprotocol.io/) <!-- Clarified SDK version -->
[![Version](https://img.shields.io/badge/Version-1.1.1-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/cyanheads/mcp-ts-template/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/mcp-ts-template?style=social)](https://github.com/cyanheads/mcp-ts-template)

**Jumpstart your [Model Context Protocol (MCP) Client & Server](https://modelcontextprotocol.io/) development with this TypeScript Repo Template!**

This template provides a solid, beginner-friendly foundation for building robust MCP servers and clients. It includes production-ready utilities, a well-structured codebase, working examples, and clear documentation to get you up and running quickly.

Whether you're creating a new MCP server to extend an AI's capabilities or integrating MCP client features into your application, this template is your starting point.

## ✨ Key Features

- **🚀 Production-Ready Utilities**: Includes logging, error handling, ID generation, rate limiting, request context tracking, and input sanitization out-of-the-box.
- **🔒 Type Safety & Security**: Leverages TypeScript and Zod for strong type checking and validation, plus built-in security utilities.
- **⚙️ Robust Error Handling**: Consistent error categorization and detailed logging for easier debugging.
- **🔌 MCP Server Example**: A functional server with an example [Echo Tool](src/mcp-server/tools/echoTool/index.ts) and [Echo Resource](src/mcp-server/resources/echoResource/index.ts). Supports both `stdio` and `http` (SSE) transports.
- **💻 MCP Client Example**: A working client ([src/mcp-client/](src/mcp-client/index.ts)) ready to connect to other MCP servers via `mcp-config.json`.
- **📚 Clear Documentation**: Comprehensive guides on usage, configuration, and extension.
- **🤖 Agent Ready**: Comes with a [.clinerules](.clinerules) file – a developer cheatsheet perfect for LLM coding agents, detailing patterns, file locations, and usage snippets. (Remember to update it as you customize!)

_For a deep dive into all features, see the [Detailed Features Table](#detailed-features-table) below._

## 📋 Table of Contents

[Features](#key-features) | [Quick Start](#quick-start) | [Configuration](#configuration) |
[Adding Tools/Resources](#adding-your-own-tools--resources) | [Project Structure](#project-structure) |
[More MCP Resources](#explore-more-mcp-resources) | [License](#license) | [Detailed Features](#detailed-features-table)

## Quick Start

Get the example server running in minutes:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/cyanheads/mcp-ts-template.git
    cd mcp-ts-template
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Build the project:**

    ```bash
    npm run build
    # Or use 'npm run rebuild' for a clean install (deletes node_modules, logs, dist)
    ```

4.  **Run the Example Server:**

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
      This starts an HTTP server (default: `http://127.0.0.1:3010`) using Server-Sent Events. The port, host, and allowed origins are configurable via environment variables (see [Configuration](#configuration)).

## ⚙️ Configuration

### Server Configuration (Environment Variables)

Configure the MCP server's behavior using these environment variables:

| Variable              | Description                                                              | Default             |
| --------------------- | ------------------------------------------------------------------------ | ------------------- |
| `MCP_TRANSPORT_TYPE`  | Server transport: `stdio` or `http`.                                     | `stdio`             |
| `MCP_HTTP_PORT`       | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                 | `3010`              |
| `MCP_HTTP_HOST`       | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).         | `127.0.0.1`         |
| `MCP_ALLOWED_ORIGINS` | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`). | (none)              |
| `MCP_SERVER_NAME`     | Optional server name (used in MCP initialization).                       | (from package.json) |
| `MCP_SERVER_VERSION`  | Optional server version (used in MCP initialization).                    | (from package.json) |
| `MCP_LOG_LEVEL`       | Server logging level (`debug`, `info`, `warning`, `error`, etc.).        | `info`              |
| `NODE_ENV`            | Runtime environment (`development`, `production`).                       | `development`       |

**Note on HTTP Port Retries:** If the `MCP_HTTP_PORT` is busy, the server automatically tries the next port (up to 15 times).

### Client Configuration (`mcp-config.json`)

Configure the connections for the built-in **MCP client** using `src/mcp-client/mcp-config.json`. If this file is missing, it falls back to `src/mcp-client/mcp-config.json.example`.

This file defines external MCP servers the client can connect to.

**Example `mcp-config.json`:**

```json
{
  "mcpServers": {
    "my-stdio-server": {
      "command": "node", // Command or executable
      "args": ["/path/to/my-server/index.js"], // Arguments for stdio
      "env": { "LOG_LEVEL": "debug" }, // Optional environment variables
      "transportType": "stdio" // Explicitly stdio
    },
    "my-http-server": {
      "command": "http://localhost:8080", // Base URL for HTTP
      "args": [], // Not used for HTTP
      "transportType": "http" // Explicitly http
    }
  }
}
```

- **`command`**: Executable path (`stdio`) or Base URL (`http`).
- **`args`**: Array of arguments (required for `stdio`).
- **`env`**: Optional environment variables to set for the server process (`stdio`).
- **`transportType`**: `stdio` (default) or `http`.

See `src/mcp-client/configLoader.ts` for the Zod validation schema.

## 🏗️ Project Structure

The `src/` directory is organized for clarity:

- `config/`: Loads environment variables and package info.
- `mcp-client/`: Logic for the client connecting to _external_ MCP servers.
  - `client.ts`: Core connection management.
  - `configLoader.ts`: Loads and validates `mcp-config.json`.
  - `transport.ts`: Creates `stdio` or `http` client transports.
  - `mcp-config.json.example`: Example client config. Copy to `mcp-config.json`.
- `mcp-server/`: Logic for the MCP server _provided by this template_.
  - `server.ts`: Initializes the server, registers tools/resources.
  - `resources/`: Example resource implementations (e.g., EchoResource).
  - `tools/`: Example tool implementations (e.g., EchoTool).
  - `transports/`: Handles `stdio` and `http` communication.
- `types-global/`: Shared TypeScript definitions (Errors, MCP types).
- `utils/`: Reusable utilities (logging, errors, security, parsing, etc.). Exported via `index.ts`.

**Explore the structure yourself:**

```bash
npm run tree
```

(This uses `scripts/tree.ts` to generate a current file tree.)

## 🧩 Adding Your Own Tools & Resources

This template is designed for extension!

1.  **Create Directories**: Add new directories under `src/mcp-server/tools/yourToolName/` or `src/mcp-server/resources/yourResourceName/`.
2.  **Implement Logic (`logic.ts`)**: Define Zod schemas for inputs/outputs and write your core processing function.
3.  **Register (`registration.ts`)**:
    - **Tools**: Use `server.tool(name, description, zodSchemaShape, handler)` (SDK v1.10.2+). This handles schema generation, validation, and routing.
    - **Resources**: Use `server.resource(regName, template, metadata, handler)`.
    - Wrap logic in `ErrorHandler.tryCatch` for robust error handling.
4.  **Export & Import**: Export the registration function from your new directory's `index.ts` and call it within `createMcpServerInstance` in `src/mcp-server/server.ts`.

Refer to the included `EchoTool` and `EchoResource` examples and the [.clinerules](.clinerules) cheatsheet for detailed patterns.

## 🌍 Explore More MCP Resources

Looking for more examples, guides, and pre-built MCP servers? Check out the companion repository:

➡️ **[cyanheads/model-context-protocol-resources](https://github.com/cyanheads/model-context-protocol-resources)**

This collection includes servers for Filesystem, Obsidian, Git, GitHub, Perplexity, Atlas, Ntfy, and more, along with in-depth guides based on my real-world MCP development.

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️ and the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>

## Detailed Features Table

| Category                 | Feature                         | Description                                                                                                  | Location(s)                                      |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Core Components**      | MCP Server                      | Core server logic, tool/resource registration, transport handling. Includes Echo Tool & Resource examples.   | `src/mcp-server/`                                |
|                          | MCP Client                      | Logic for connecting to external MCP servers defined in `mcp-config.json`.                                   | `src/mcp-client/`                                |
|                          | Configuration                   | Environment-aware settings with Zod validation.                                                              | `src/config/`, `src/mcp-client/configLoader.ts`  |
|                          | HTTP Transport                  | Express-based server with SSE, session management, CORS, port retries.                                       | `src/mcp-server/transports/httpTransport.ts`     |
|                          | Stdio Transport                 | Handles MCP communication over standard input/output.                                                        | `src/mcp-server/transports/stdioTransport.ts`    |
| **Utilities (Core)**     | Logger                          | Structured, context-aware logging (files & MCP notifications).                                               | `src/utils/internal/logger.ts`                   |
|                          | ErrorHandler                    | Centralized error processing, classification, and logging.                                                   | `src/utils/internal/errorHandler.ts`             |
|                          | RequestContext                  | Request/operation tracking and correlation.                                                                  | `src/utils/internal/requestContext.ts`           |
| **Utilities (Metrics)**  | TokenCounter                    | Estimates token counts using `tiktoken`.                                                                     | `src/utils/metrics/tokenCounter.ts`              |
| **Utilities (Parsing)**  | DateParser                      | Parses natural language date strings using `chrono-node`.                                                    | `src/utils/parsing/dateParser.ts`                |
|                          | JsonParser                      | Parses potentially partial JSON, handles `<think>` blocks.                                                   | `src/utils/parsing/jsonParser.ts`                |
| **Utilities (Security)** | IdGenerator                     | Generates unique IDs (prefixed or UUIDs).                                                                    | `src/utils/security/idGenerator.ts`              |
|                          | RateLimiter                     | Request throttling based on keys.                                                                            | `src/utils/security/rateLimiter.ts`              |
|                          | Sanitization                    | Input validation/cleaning (HTML, paths, URLs, numbers, JSON) & log redaction (`validator`, `sanitize-html`). | `src/utils/security/sanitization.ts`             |
| **Type Safety**          | Global Types                    | Shared TypeScript definitions for consistent interfaces (Errors, MCP, Tools).                                | `src/types-global/`                              |
|                          | Zod Schemas                     | Used for robust validation of configuration files and tool/resource inputs.                                  | Throughout (`config`, `mcp-client`, tools, etc.) |
| **Error Handling**       | Pattern-Based Classification    | Automatically categorize errors based on message patterns.                                                   | `src/utils/internal/errorHandler.ts`             |
|                          | Consistent Formatting           | Standardized error responses with additional context.                                                        | `src/utils/internal/errorHandler.ts`             |
|                          | Safe Try/Catch Patterns         | Centralized error processing helpers (`ErrorHandler.tryCatch`).                                              | `src/utils/internal/errorHandler.ts`             |
|                          | Client/Transport Error Handling | Specific handlers for MCP client and transport errors.                                                       | `src/mcp-client/client.ts`, `transport.ts`       |
| **Security**             | Input Validation                | Using `validator` and `zod` for various data type checks.                                                    | `src/utils/security/sanitization.ts`, etc.       |
|                          | Input Sanitization              | Using `sanitize-html` to prevent injection attacks.                                                          | `src/utils/security/sanitization.ts`             |
|                          | Sensitive Data Redaction        | Automatic redaction in logs.                                                                                 | `src/utils/security/sanitization.ts`             |
|                          | Configuration Fallback          | Safely falls back to `mcp-config.json.example` if primary client config is missing.                          | `src/mcp-client/configLoader.ts`                 |
