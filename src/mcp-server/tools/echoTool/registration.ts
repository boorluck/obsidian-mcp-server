import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Import schema and types from the logic file
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
// Import utils from the main barrel file (ErrorHandler, logger, requestContextService from ../../../utils/internal/*)
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import type { EchoToolInput } from './echoToolLogic.js'; // Use type import
import { EchoToolInputSchema } from './echoToolLogic.js'; // Schema needed for shape extraction
// Import the core logic function
import { processEchoMessage } from './echoToolLogic.js';

/**
 * Registers the 'echo_message' tool and its handler with the provided MCP server instance.
 * Defines the tool's input schema, description, and the core request handling logic.
 * Error handling is integrated using ErrorHandler. (Asynchronous)
 *
 * @function registerEchoTool
 * @param {McpServer} server - The MCP server instance to register the tool with.
 * @returns {Promise<void>} A promise that resolves when the tool registration is complete.
 * @throws {McpError} Throws an McpError if the registration process fails critically.
 */
export const registerEchoTool = async (server: McpServer): Promise<void> => {
  const toolName = "echo_message"; // The unique identifier for the tool
  const toolDescription = "Echoes a message back with optional formatting and repetition."; // Tool description

  // Create registration context using the service
  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterEchoTool',
    toolName: toolName,
    module: 'EchoToolRegistration'
  });

  logger.info(`Registering tool: ${toolName}`, registrationContext);

  // Use ErrorHandler to wrap the entire registration process
  await ErrorHandler.tryCatch(
    async () => {
      // Register the tool using the 4-argument server.tool() overload (SDK v1.10.2+)
      server.tool(
        toolName,
        toolDescription, // Argument 2: Tool Description
        // --- Tool Input Schema (Raw Shape) ---
        // Pass the raw shape of the Zod schema. The SDK uses this for validation.
        EchoToolInputSchema.shape, // Argument 3: Schema Shape
        // --- Tool Handler ---
        // The core logic executed when the tool is called.
        // Params are automatically validated against the provided schema shape by the SDK.
        async (params: EchoToolInput) => { // Argument 4: Handler
          // Create handler context using the service
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext, // Link to registration context
            operation: 'HandleEchoToolRequest',
            toolName: toolName,
            params: params // Include relevant request details
          });
          logger.debug("Handling echo tool request", handlerContext);

          // Wrap the handler logic in tryCatch for robust error handling
          return await ErrorHandler.tryCatch(
            async () => {
              // Delegate the core processing logic, passing the context
              const response = processEchoMessage(params, handlerContext);
              logger.debug("Echo tool processed successfully", handlerContext);

              // Return the response in the standard MCP tool result format
              // as required by the SDK's server.tool method signature.
              return {
                content: [{
                  type: "text", // Content type is text
                  // The actual content is a JSON string representing the EchoToolResponse
                  text: JSON.stringify(response, null, 2)
                }],
                isError: false // Explicitly set isError to false for successful execution
              };
            },
            {
              // Configuration for the error handler specific to this tool call
              operation: 'processing echo message handler',
              context: handlerContext, // Pass handler-specific context
              input: params, // Log input parameters on error
              // Provide a custom error mapping for more specific error reporting
              errorMapper: (error: unknown) => new McpError( // Add type 'unknown' to error parameter
                // Use VALIDATION_ERROR if the error likely stems from processing invalid (though schema-valid) input
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing echo message tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { ...handlerContext } // Include context in the McpError
              )
            }
          );
        }
      ); // End of server.tool call

      logger.info(`Tool registered successfully: ${toolName}`, registrationContext);
    },
    {
      // Configuration for the error handler wrapping the entire registration
      operation: `registering tool ${toolName}`,
      context: registrationContext, // Context for registration-level errors
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code for registration failure
      // Custom error mapping for registration failures
      errorMapper: (error: unknown) => new McpError( // Add type 'unknown' to error parameter
        error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
        `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ...registrationContext } // Include context in the McpError
      ),
      critical: true // Mark registration failure as critical to halt startup
    }
  ); // End of ErrorHandler.tryCatch for registration
};
