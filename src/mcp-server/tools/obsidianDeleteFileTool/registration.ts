import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import input type, response type, schema, and logic function
import type { ObsidianDeleteFileInput, ObsidianDeleteFileResponse } from './logic.js'; // Added Response type
import { ObsidianDeleteFileInputSchema, processObsidianDeleteFile } from './logic.js';

/**
 * Registers the 'obsidian_delete_file' tool.
 *
 * @param server - The MCP server instance.
 * @param obsidianService - The Obsidian REST API service instance.
 */
export const registerObsidianDeleteFileTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService // Inject Obsidian service
): Promise<void> => {
  const toolName = "obsidian_delete_file";
  // Updated description for formatted timestamp
  const toolDescription = "Permanently deletes a specified file from the Obsidian vault. Tries the exact path first, then attempts a case-insensitive fallback if the file is not found. Requires the vault-relative path including the file extension. Returns a success message and a formatted timestamp string.";

  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianDeleteFileTool',
    toolName: toolName,
    module: 'ObsidianDeleteFileRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ObsidianDeleteFileInputSchema.shape, // Pass the raw Zod schema shape
        async (params: ObsidianDeleteFileInput) => { // Handler function
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianDeleteFileRequest',
            toolName: toolName,
            params: { filePath: params.filePath } // Log relevant params
          });
          logger.debug("Handling obsidian_delete_file request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Call the core logic function, passing the service instance
              // Response now includes timestamp
              const response: ObsidianDeleteFileResponse = await processObsidianDeleteFile(params, handlerContext, obsidianService);
              logger.debug("obsidian_delete_file processed successfully", handlerContext);

              // Format the success response object into MCP format
              return {
                content: [{
                  type: "text",
                  // Stringify the entire response object
                  text: JSON.stringify(response, null, 2)
                }],
                isError: false
              };
            },
            {
              operation: 'processing obsidian_delete_file handler',
              context: handlerContext,
              input: params,
              errorMapper: (error: unknown) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing obsidian_delete_file tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { ...handlerContext }
              )
            }
          );
        }
      ); // End of server.tool call

      logger.info(`Tool registered successfully: ${toolName}`, registrationContext);
    },
    {
      operation: `registering tool ${toolName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INTERNAL_ERROR,
      errorMapper: (error: unknown) => new McpError(
        error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
        `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ...registrationContext }
      ),
      critical: true
    }
  ); // End of ErrorHandler.tryCatch for registration
};
