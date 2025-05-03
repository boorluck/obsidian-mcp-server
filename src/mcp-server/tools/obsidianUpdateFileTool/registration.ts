import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import both the registration input type (for handler signature) and the refined schema (for parsing)
import type { ObsidianUpdateFileRegistrationInput, ObsidianUpdateFileResponse } from './logic.js'; // Added ObsidianUpdateFileResponse
import { ObsidianUpdateFileInputSchema, ObsidianUpdateFileInputSchemaShape, processObsidianUpdateFile } from './logic.js';

/**
 * Registers the 'obsidian_update_file' tool.
 *
 * @param server - The MCP server instance.
 * @param obsidianService - The Obsidian REST API service instance.
 */
export const registerObsidianUpdateFileTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService // Inject Obsidian service
): Promise<void> => {
  const toolName = "obsidian_update_file";
  // Updated description for formatted timestamp (removed clarification)
  const toolDescription = "Tool to modify Obsidian notes (specified by file path, the active file, or a periodic note) using whole-file operations: 'append', 'prepend', or 'overwrite'. Options allow creating missing files/targets and controlling overwrite behavior. Returns success status, message, a formatted timestamp string, file stats (stat), and optionally the final file content.";

  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianUpdateFileTool',
    toolName: toolName,
    module: 'ObsidianUpdateFileRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ObsidianUpdateFileInputSchemaShape, // Pass the raw Zod schema shape (now includes returnContent)
        async (params: ObsidianUpdateFileRegistrationInput) => { // Handler uses the type inferred from the registration shape
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianUpdateFileRequest',
            toolName: toolName,
            params: { // Log key parameters for context
                targetType: params.targetType,
                modificationType: params.modificationType, // Will always be 'wholeFile'
                targetIdentifier: params.targetIdentifier,
                wholeFileMode: params.wholeFileMode,
                returnContent: params.returnContent, // Log new param
            }
          });
          logger.debug("Handling obsidian_update_file request (wholeFile mode)", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Explicitly parse the input using the refined schema
              const validatedParams = ObsidianUpdateFileInputSchema.parse(params);

              // Call the core logic function, passing the *validated* params and the service instance
              const response: ObsidianUpdateFileResponse = await processObsidianUpdateFile(validatedParams, handlerContext, obsidianService);
              logger.debug("obsidian_update_file (wholeFile mode) processed successfully", handlerContext);

              // Format the success response (which now includes timestamp, stat, optional finalContent) into MCP format
              return {
                content: [{
                  type: "text",
                  // Serialize the entire response object
                  text: JSON.stringify(response, null, 2)
                }],
                isError: false
              };
            },
            {
              operation: 'processing obsidian_update_file handler',
              context: handlerContext,
              input: params, // Log full input on error
              errorMapper: (error: unknown) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing obsidian_update_file tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
