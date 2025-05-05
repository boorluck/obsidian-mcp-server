/**
 * @module ObsidianGlobalSearchToolRegistration
 * @description Registers the 'obsidian_global_search' tool with the MCP server.
 * This tool allows searching the Obsidian vault using text/regex queries with optional date filters.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import type { VaultCacheService } from '../../../services/vaultCache/index.js'; // Import VaultCacheService type
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler, logger, RequestContext, requestContextService } from '../../../utils/index.js';
// Import types, schema shape, and the core processing logic from logic.ts
import type { ObsidianGlobalSearchInput, ObsidianGlobalSearchResponse } from './logic.js'; // Ensure '.js' extension
import { ObsidianGlobalSearchInputSchemaShape, processObsidianGlobalSearch } from './logic.js'; // Ensure '.js' extension

/**
 * Registers the 'obsidian_global_search' tool with the MCP server instance.
 *
 * @param {McpServer} server - The MCP server instance.
 * @param {ObsidianRestApiService} obsidianService - The instance of the Obsidian REST API service.
 * @param {VaultCacheService} vaultCacheService - The instance of the Vault Cache service.
 * @returns {Promise<void>} A promise that resolves when the tool is registered.
 * @throws {McpError} If registration fails critically.
 */
export async function registerObsidianGlobalSearchTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService // Added vaultCacheService parameter
): Promise<void> {
  const toolName = 'obsidian_global_search';
  // Updated description to include searchInPath
  const toolDescription = `Performs search across the Obsidian vault using text or regex, primarily relying on the Obsidian REST API's simple search. Supports filtering by modification date, optionally restricting search to a specific directory path (recursively), pagination (page, pageSize), and limiting matches shown per file (maxMatchesPerFile). Returns a JSON object containing success status, a message, pagination details (currentPage, pageSize, totalPages), total file/match counts (before pagination), and an array of results. Each result includes the file path, filename, creation timestamp (ctime), modification timestamp (mtime), and an array of match context snippets (limited by maxMatchesPerFile). If there are multiple pages of results, it also includes an 'alsoFoundInFiles' array listing filenames found on other pages.`;

  // Create a context for the registration process itself.
  const registrationContext: RequestContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianGlobalSearchTool',
    toolName: toolName,
    module: 'ObsidianGlobalSearchRegistration'
  });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  // Wrap the registration in a tryCatch block for robust error handling.
  await ErrorHandler.tryCatch(
    async () => {
      // Use the high-level SDK method for tool registration.
      server.tool(
        toolName,
        toolDescription,
        ObsidianGlobalSearchInputSchemaShape, // Provide the Zod schema shape (already updated in logic.ts)
        /**
         * The handler function executed when the 'obsidian_global_search' tool is called.
         *
         * @param {ObsidianGlobalSearchInput} params - The validated input parameters.
         * @param {any} handlerInvocationContext - Context object provided by the SDK.
         * @returns {Promise<any>} A promise resolving to the result object or an McpError instance.
         */
        async (params: ObsidianGlobalSearchInput, handlerInvocationContext: any): Promise<any> => {
          // Create a specific RequestContext for logging/error handling.
          const handlerContext: RequestContext = requestContextService.createRequestContext({
            operation: 'HandleObsidianGlobalSearchRequest',
            toolName: toolName,
            // Updated paramsSummary for pagination, match limit, and path filter
            paramsSummary: {
                useRegex: params.useRegex,
                caseSensitive: params.caseSensitive,
                pageSize: params.pageSize,
                page: params.page,
                maxMatchesPerFile: params.maxMatchesPerFile,
                searchInPath: params.searchInPath, // Added searchInPath
                hasDateFilter: !!(params.modified_since || params.modified_until)
            }
          });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

           // Wrap the core logic execution in a tryCatch block.
           try {
            // Delegate the actual search logic to the (refactored) processing function.
            const response: ObsidianGlobalSearchResponse = await processObsidianGlobalSearch(
              params,
                handlerContext,
                obsidianService,
                vaultCacheService // Pass vaultCacheService here
             );
             logger.debug(`'${toolName}' processed successfully`, handlerContext);

             // Format the successful response object into the required MCP CallToolResult structure.
             return {
               content: [{
                 type: "text", // Use text type for structured JSON data
                 text: JSON.stringify(response, null, 2) // Pretty-print JSON
               }],
               isError: false // Indicate successful execution
             };

           } catch (error) {
             // Log the error from the processing logic
              logger.error(`Error during ${toolName} processing`, error instanceof Error ? error : undefined, handlerContext);

             // Ensure we return an McpError instance
             const mcpError = error instanceof McpError
               ? error
               : new McpError(
                   BaseErrorCode.INTERNAL_ERROR,
                   `Error processing ${toolName} tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                   { ...handlerContext } // Pass our custom context
                 );

             // Explicitly return the CallToolResult error structure
             return {
                content: [{ type: 'text', text: mcpError.message }], // Use error message as content
                isError: true
             };
          }
        }
      ); // End of server.tool call

      logger.info(`Tool registered successfully: ${toolName}`, registrationContext);
    },
    {
      // Configuration for the outer error handler (registration process).
      operation: `registering tool ${toolName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code for registration failure.
      // Custom error mapping for registration failures.
      errorMapper: (error: unknown) => new McpError(
        error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
        `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ...registrationContext }
      ),
      critical: true // Registration failure is critical.
    }
  ); // End of outer ErrorHandler.tryCatch
}
