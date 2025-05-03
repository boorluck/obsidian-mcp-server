import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import type { ObsidianDeleteFileInput } from './logic.js'; // Use type import
import { ObsidianDeleteFileInputSchema, processObsidianDeleteFile } from './logic.js'; // Schema and logic function

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
  const toolDescription = "Permanently deletes a specified file from the Obsidian vault. Tries the exact path first, then attempts a case-insensitive fallback if the file is not found. Requires the vault-relative path including the file extension.";

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
              const response = await processObsidianDeleteFile(params, handlerContext, obsidianService);
              logger.debug("obsidian_delete_file processed successfully", handlerContext);

              // Format the success response into MCP format
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response, null, 2) // Contains { success: true, message: "..." }
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
