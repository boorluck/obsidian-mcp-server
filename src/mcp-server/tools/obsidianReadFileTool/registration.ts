import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import input type, response type, schema, and logic function
import type { ObsidianReadFileInput, ObsidianReadFileResponse } from './logic.js'; // Added Response type
import { ObsidianReadFileInputSchema, processObsidianReadFile } from './logic.js';

/**
 * Registers the 'obsidian_read_file' tool.
 *
 * @param server - The MCP server instance.
 * @param obsidianService - The Obsidian REST API service instance.
 */
export const registerObsidianReadFileTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService // Inject Obsidian service
): Promise<void> => {
  const toolName = "obsidian_read_file";
  // Updated description for formatted timestamp
  const toolDescription = "Retrieves the content and metadata of a specified file within the Obsidian vault. Tries the exact path first, then attempts a case-insensitive fallback. Returns an object containing the content (markdown string or full NoteJson object based on 'format'), a formatted timestamp string, and optionally file stats ('stat' object with creationTime, modifiedTime, size). Use 'includeStat: true' with 'format: markdown' to include stats; stats are always included with 'format: json'.";

  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianReadFileTool',
    toolName: toolName,
    module: 'ObsidianReadFileRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ObsidianReadFileInputSchema.shape, // Pass the raw Zod schema shape (now includes includeStat)
        async (params: ObsidianReadFileInput) => { // Handler function
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianReadFileRequest',
            toolName: toolName,
            params: { filePath: params.filePath, format: params.format, includeStat: params.includeStat } // Log relevant params including new one
          });
          logger.debug("Handling obsidian_read_file request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Call the core logic function, passing the service instance
              // Response is now always ObsidianReadFileResponse object
              const response: ObsidianReadFileResponse = await processObsidianReadFile(params, handlerContext, obsidianService);
              logger.debug("obsidian_read_file processed successfully", handlerContext);

              // Format the response object into MCP format
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
              operation: 'processing obsidian_read_file handler',
              context: handlerContext,
              input: params,
              errorMapper: (error: unknown) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing obsidian_read_file tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
