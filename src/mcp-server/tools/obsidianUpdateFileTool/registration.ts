import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import both the registration input type (for handler signature) and the refined schema (for parsing)
import type { ObsidianUpdateFileRegistrationInput } from './logic.js';
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
  const toolDescription = "Versatile tool to modify Obsidian notes (specified by file path, the active file, or a periodic note). Supports two main modes: 'wholeFile' (append, prepend, overwrite entire content) and 'patch' (granular append, prepend, or replace relative to internal structures like headings, blocks, or frontmatter keys). Includes case-insensitive fallback for heading targets in patch mode. Options allow creating missing files/targets and controlling overwrite behavior.";

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
        ObsidianUpdateFileInputSchemaShape, // Pass the raw Zod schema shape for registration
        async (params: ObsidianUpdateFileRegistrationInput) => { // Handler uses the type inferred from the registration shape
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianUpdateFileRequest',
            toolName: toolName,
            params: { // Log key parameters for context
                targetType: params.targetType,
                modificationType: params.modificationType,
                targetIdentifier: params.targetIdentifier,
                // Conditionally log mode/patch details
                ...(params.modificationType === 'wholeFile' ? { wholeFileMode: params.wholeFileMode } : {}),
                ...(params.modificationType === 'patch' ? { patchOperation: params.patchOperation, patchTargetType: params.patchTargetType, patchTarget: params.patchTarget } : {}),
            }
          });
          logger.debug("Handling obsidian_update_file request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Explicitly parse the input using the refined discriminated union schema
              // This ensures the logic function receives the correctly typed and validated parameters.
              const validatedParams = ObsidianUpdateFileInputSchema.parse(params);

              // Call the core logic function, passing the *validated* params and the service instance
              const response = await processObsidianUpdateFile(validatedParams, handlerContext, obsidianService);
              logger.debug("obsidian_update_file processed successfully", handlerContext);

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
