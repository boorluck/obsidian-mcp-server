import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import type { ObsidianReadFileInput } from './logic.js'; // Use type import
import { ObsidianReadFileInputSchema, processObsidianReadFile } from './logic.js'; // Schema and logic function

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
  const toolDescription = "Retrieves the content of a specified file within the Obsidian vault. Tries the exact path first, then attempts a case-insensitive fallback if the file is not found. Can return either the raw markdown content or a structured JSON object (NoteJson) including frontmatter, tags, and metadata.";

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
        ObsidianReadFileInputSchema.shape, // Pass the raw Zod schema shape
        async (params: ObsidianReadFileInput) => { // Handler function
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianReadFileRequest',
            toolName: toolName,
            params: { filePath: params.filePath, format: params.format } // Log relevant params
          });
          logger.debug("Handling obsidian_read_file request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Call the core logic function, passing the service instance
              const response = await processObsidianReadFile(params, handlerContext, obsidianService);
              logger.debug("obsidian_read_file processed successfully", handlerContext);

              // Format the response (string or NoteJson) into MCP format
              return {
                content: [{
                  type: "text",
                  // Stringify the result, whether it's markdown string or NoteJson object
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
