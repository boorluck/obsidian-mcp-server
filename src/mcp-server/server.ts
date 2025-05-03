/**
 * Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core McpServer instance with its identity and capabilities.
 * 2. Registers available resources and tools, making them discoverable and usable by clients.
 * 3. Selects and starts the appropriate communication transport (stdio or Streamable HTTP)
 *    based on configuration.
 * 4. Handles top-level error management during startup.
 *
 * MCP Specification References:
 * - Lifecycle: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/lifecycle.mdx
 * - Overview (Capabilities): https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/index.mdx
 * - Transports: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Import validated configuration and environment details.
import { config, environment } from '../config/index.js';
// Import core utilities: ErrorHandler, logger, requestContextService.
import { ErrorHandler, logger, requestContextService } from '../utils/index.js';
// Import the Obsidian service
import { ObsidianRestApiService } from '../services/obsidianRestAPI/index.js';
// Import registration functions for specific resources and tools.
// import { registerEchoResource } from './resources/echoResource/index.js'; // Not currently implemented
import { registerEchoTool } from './tools/echoTool/index.js';
import { registerObsidianReadFileTool } from './tools/obsidianReadFileTool/index.js';
import { registerObsidianUpdateFileTool } from './tools/obsidianUpdateFileTool/index.js';
import { registerObsidianDeleteFileTool } from './tools/obsidianDeleteFileTool/index.js';
import { registerObsidianListFilesTool } from './tools/obsidianListFilesTool/index.js';
import { registerObsidianSearchReplaceTool } from './tools/obsidianSearchReplaceTool/index.js'; // Import the new tool
// Import transport setup functions.
import { startHttpTransport } from './transports/httpTransport.js';
import { connectStdioTransport } from './transports/stdioTransport.js';


/**
 * Creates and configures a new instance of the McpServer.
 *
 * This function is central to defining the server's identity and functionality
 * as presented to connecting clients during the MCP initialization phase.
 *
 * MCP Spec Relevance:
 * - Server Identity (`serverInfo`): The `name` and `version` provided here are part
 *   of the `ServerInformation` object returned in the `InitializeResult` message,
 *   allowing clients to identify the server they are connected to.
 * - Capabilities Declaration: The `capabilities` object declares the features this
 *   server supports, enabling clients to tailor their interactions.
 *   - `logging: {}`: Indicates the server can receive `logging/setLevel` requests
 *     and may send `notifications/message` log messages (handled by the logger utility).
 *   - `resources: { listChanged: true }`: Signals that the server supports dynamic
 *     resource lists and will send `notifications/resources/list_changed` if the
 *     available resources change after initialization.
 *   - `tools: { listChanged: true }`: Signals support for dynamic tool lists and
 *     `notifications/tools/list_changed`.
 * - Resource/Tool Registration: This function calls specific registration functions
 *   (e.g., `registerEchoResource`) which use SDK methods (`server.resource`, `server.tool`)
 *   to make capabilities available for discovery (`resources/list`, `tools/list`) and
 *   invocation (`resources/read`, `tools/call`).
 *
 * Design Note: This factory function is used to create server instances. For the 'stdio'
 * transport, it's called once. For the 'http' transport, it's passed to `startHttpTransport`
 * and called *per session* to ensure session isolation.
 *
 * @returns {Promise<McpServer>} A promise resolving with the configured McpServer instance.
 * @throws {Error} If any resource or tool registration fails.
 */
async function createMcpServerInstance(): Promise<McpServer> {
  const context = { operation: 'createMcpServerInstance' };
  logger.info('Initializing MCP server instance', context);

  // Configure the request context service (used for correlating logs/errors).
  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  // Instantiate the core McpServer using the SDK.
  // Provide server identity (name, version) and declare supported capabilities.
  logger.debug('Instantiating McpServer with capabilities', { ...context, serverInfo: { name: config.mcpServerName, version: config.mcpServerVersion }, capabilities: { logging: {}, resources: { listChanged: true }, tools: { listChanged: true } } });
  const server = new McpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion }, // ServerInformation part of InitializeResult
    { capabilities: { logging: {}, resources: { listChanged: true }, tools: { listChanged: true } } } // Declared capabilities
  );

  // Instantiate the Obsidian REST API Service
  // This instance will be shared by all tools needing Obsidian access within this server instance.
  // Error during instantiation here is critical and will be caught by the outer try/catch.
  logger.debug('Instantiating ObsidianRestApiService...', context);
  const obsidianService = new ObsidianRestApiService();
  logger.info('ObsidianRestApiService instantiated successfully.', context);

  try {
    // Register all defined resources and tools. These calls populate the server's
    // internal registry, making them available via MCP methods like 'tools/list'.
    logger.debug('Registering resources and tools...', context);
    // await registerEchoResource(server); // Not currently implemented
    await registerEchoTool(server);     // Example tool registration

    // --- Register Obsidian Tools ---
    // Pass the obsidianService instance to each registration function.
    await registerObsidianReadFileTool(server, obsidianService);
    await registerObsidianUpdateFileTool(server, obsidianService);
    await registerObsidianDeleteFileTool(server, obsidianService);
    await registerObsidianListFilesTool(server, obsidianService);
    await registerObsidianSearchReplaceTool(server, obsidianService); // Register the new tool
    // TODO: Add registration calls for any other Obsidian tools here

    logger.info('Resources and tools registered successfully', context);
  } catch (err) {
    // Registration is critical; log and re-throw errors.
    logger.error('Failed to register resources/tools', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined, // Include stack for debugging
    });
    throw err; // Propagate error to prevent server starting with incomplete capabilities.
  }

  return server;
}


/**
 * Selects, sets up, and starts the appropriate MCP transport layer based on configuration.
 * This function acts as the bridge between the core server logic and the communication channel.
 *
 * MCP Spec Relevance:
 * - Transport Selection: Reads `config.mcpTransportType` ('stdio' or 'http') to determine
 *   which transport mechanism defined in the MCP specification to use.
 * - Transport Connection: Calls dedicated functions (`connectStdioTransport` or `startHttpTransport`)
 *   which handle the specifics of establishing communication according to the chosen
 *   transport's rules (e.g., stdin/stdout handling for 'stdio', HTTP server setup and
 *   endpoint handling for 'http').
 * - Server Instance Lifecycle:
 *   - For 'stdio', creates a single `McpServer` instance for the lifetime of the process.
 *   - For 'http', passes the `createMcpServerInstance` factory function to `startHttpTransport`,
 *     allowing the HTTP transport to create a new, isolated server instance for each client session,
 *     aligning with the stateful session management described in the Streamable HTTP spec.
 *
 * @returns {Promise<McpServer | void>} Resolves with the McpServer instance for 'stdio', or void for 'http'.
 * @throws {Error} If the configured transport type is unsupported or if transport setup fails.
 */
async function startTransport(): Promise<McpServer | void> {
  // Determine the transport type from the validated configuration.
  const transportType = config.mcpTransportType;
  const context = { operation: 'startTransport', transport: transportType };
  logger.info(`Starting transport: ${transportType}`, context);

  // --- HTTP Transport Setup ---
  if (transportType === 'http') {
    logger.debug('Delegating to startHttpTransport...', context);
    // For HTTP, the transport layer manages its own lifecycle and potentially multiple sessions.
    // We pass the factory function to allow the HTTP transport to create server instances as needed (per session).
    await startHttpTransport(createMcpServerInstance, context);
    // The HTTP server runs indefinitely, listening for connections, so this function returns void.
    return;
  }

  // --- Stdio Transport Setup ---
  if (transportType === 'stdio') {
    logger.debug('Creating single McpServer instance for stdio transport...', context);
    // For stdio, there's typically one persistent connection managed by a parent process.
    // Create a single McpServer instance for the entire process lifetime.
    const server = await createMcpServerInstance();
    logger.debug('Delegating to connectStdioTransport...', context);
    // Connect the server instance to the stdio transport handler.
    await connectStdioTransport(server, context);
    // Return the server instance; the caller (main entry point) might hold onto it.
    return server;
  }

  // --- Unsupported Transport ---
  // This case should theoretically not be reached due to config validation, but acts as a safeguard.
  logger.fatal(`Unsupported transport type configured: ${transportType}`, context);
  throw new Error(`Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`);
}

/**
 * Main application entry point. Initializes and starts the MCP server.
 *
 * MCP Spec Relevance:
 * - Orchestrates the server startup sequence, culminating in a server ready to accept
 *   connections and process MCP messages according to the chosen transport's rules.
 * - Implements top-level error handling for critical startup failures, ensuring the
 *   process exits appropriately if it cannot initialize correctly.
 *
 * @returns {Promise<void | McpServer>} Resolves upon successful startup (void for http, McpServer for stdio). Rejects on critical failure.
 */
export async function initializeAndStartServer(): Promise<void | McpServer> {
  const context = { operation: 'initializeAndStartServer' };
  logger.info('MCP Server initialization sequence started.', context);
  try {
    // Initiate the transport setup based on configuration.
    const result = await startTransport();
    logger.info('MCP Server initialization sequence completed successfully.', context);
    return result;
  } catch (err) {
    // Catch any errors that occurred during server instance creation or transport setup.
    logger.fatal('Critical error during MCP server initialization.', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Use the centralized error handler for consistent critical error reporting.
    ErrorHandler.handleError(err, { ...context, critical: true });
    // Exit the process with a non-zero code to indicate failure.
    logger.info('Exiting process due to critical initialization error.', context);
    process.exit(1);
  }
}
