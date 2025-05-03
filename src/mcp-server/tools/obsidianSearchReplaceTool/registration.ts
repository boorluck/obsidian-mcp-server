import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
// Import registration type, refined schema for parsing, base shape for registration, and logic function
import type { ObsidianSearchReplaceRegistrationInput } from './logic.js';
import { ObsidianSearchReplaceInputSchema, ObsidianSearchReplaceInputSchemaShape, processObsidianSearchReplace } from './logic.js';

/**
 * Registers the 'obsidian_search_replace' tool.
 *
 * @param server - The MCP server instance.
 * @param obsidianService - The Obsidian REST API service instance.
 */
export const registerObsidianSearchReplaceTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService // Inject Obsidian service
): Promise<void> => {
  const toolName = "obsidian_search_replace";
  const toolDescription = "Performs one or more search-and-replace operations within a target Obsidian note (file path, active, or periodic). Reads the file, applies replacements sequentially in memory, and writes the modified content back, overwriting the original. Supports string/regex search, case sensitivity toggle, and replacing first/all occurrences.";

  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterObsidianSearchReplaceTool',
    toolName: toolName,
    module: 'ObsidianSearchReplaceRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);



  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ObsidianSearchReplaceInputSchemaShape, // Use the exported base shape
        async (params: ObsidianSearchReplaceRegistrationInput) => { // Handler uses the type inferred from the base shape
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: 'HandleObsidianSearchReplaceRequest',
            toolName: toolName,
            params: { // Log key params
                targetType: params.targetType,
                targetIdentifier: params.targetIdentifier,
                replacementCount: params.replacements.length,
                useRegex: params.useRegex,
                replaceAll: params.replaceAll,
                caseSensitive: params.caseSensitive,
            }
          });
          logger.debug("Handling obsidian_search_replace request", handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              // Explicitly parse the input using the refined schema before calling logic
              const validatedParams = ObsidianSearchReplaceInputSchema.parse(params);

              // Call the core logic function with validated params
              const response = await processObsidianSearchReplace(validatedParams, handlerContext, obsidianService);
              logger.debug("obsidian_search_replace processed successfully", handlerContext);

              // Format the success response into MCP format
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response, null, 2)
                }],
                isError: false
              };
            },
            {
              operation: 'processing obsidian_search_replace handler',
              context: handlerContext,
              input: params, // Log full input on error
              errorMapper: (error: unknown) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing obsidian_search_replace tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
