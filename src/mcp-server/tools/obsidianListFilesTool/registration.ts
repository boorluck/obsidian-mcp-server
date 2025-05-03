import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import input type, response type, schema, and logic function
import type { ObsidianListFilesInput, ObsidianListFilesResponse } from './logic.js'; // Added Response type
import { ObsidianListFilesInputSchema, processObsidianListFiles } from './logic.js';

/**
 * Registers the 'obsidian_list_files' tool.
 *
 * @param server - The MCP server instance.
 * @param obsidianService - The Obsidian REST API service instance.
 */
export const registerObsidianListFilesTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService // Inject Obsidian service
): Promise<void> => {
  const toolName = "obsidian_list_files";
  // Updated description for formatted timestamp and clearer stat names
  const toolDescription = "Lists files and subdirectories within a specified Obsidian vault folder. Supports optional filtering by extension or name regex. Returns a detailed object containing the listed directory path, total entry count, a formatted timestamp string, and an array of entries, each with name, full path, type (file/directory), and file stats (creationTime, modifiedTime, size). Use an empty string or '/' for dirPath to list the vault root.";

  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianListFilesTool',
    toolName: toolName,
    module: 'ObsidianListFilesRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ObsidianListFilesInputSchema.shape, // Pass the raw Zod schema shape
        async (params: ObsidianListFilesInput) => { // Handler function
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianListFilesRequest',
            toolName: toolName,
            // Log all params including filters
            params: { dirPath: params.dirPath, fileExtensionFilter: params.fileExtensionFilter, nameRegexFilter: params.nameRegexFilter }
          });
          logger.debug("Handling obsidian_list_files request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Call the core logic function, passing the service instance
              // The response is now the enhanced ObsidianListFilesResponse object
              const response: ObsidianListFilesResponse = await processObsidianListFiles(params, handlerContext, obsidianService);
              logger.debug("obsidian_list_files processed successfully", handlerContext);

              // Format the enhanced response object into MCP format
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response, null, 2) // Serialize the whole response object
                }],
                isError: false
              };
            },
            {
              operation: 'processing obsidian_list_files handler',
              context: handlerContext,
              input: params,
              errorMapper: (error: unknown) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing obsidian_list_files tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
