import { z } from 'zod';
// Import utils from the main barrel file (logger from ../../../utils/internal/logger.js, RequestContext from ../../../utils/internal/requestContext.js)
import { logger, type RequestContext } from '../../../utils/index.js';

/**
 * Zod schema defining the expected *query* parameters for the echo resource.
 * Note: Path parameters (like '{message}' in 'echo://{message}') are defined
 * in the ResourceTemplate and are typically extracted directly from the URI path,
 * not validated by this schema. This schema focuses on optional or additional
 * parameters passed via the query string (e.g., ?param=value).
 * Used for validation and type inference of query parameters.
 */
export const querySchema = z.object({
  /** Optional message to be echoed back in the response. */
  message: z.string().optional()
    .describe('Message to echo back in the response')
});

/**
 * TypeScript type inferred from the `querySchema`. Represents the validated query parameters.
 * @typedef {z.infer<typeof querySchema>} EchoParams
 */
export type EchoParams = z.infer<typeof querySchema>;

/**
 * Processes the core logic for the echo resource request.
 * Takes the request URI and validated parameters, then constructs the response data.
 *
 * @function processEchoResource
 * @param {URL} uri - The full URI of the incoming resource request.
 * @param {EchoParams} params - The validated query parameters for the request.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @returns {EchoResourceResponse} The data payload for the response (will be JSON-stringified by the handler).
 */
export const processEchoResource = (
  uri: URL,
  params: EchoParams,
  context: RequestContext // Add context parameter
): { message: string; timestamp: string; requestUri: string } => {
  // The 'message' parameter is guaranteed by the ResourceTemplate match "echo://{message}"
  // Use the value directly from the params object populated by the SDK.
  const message = params.message || 'Default message if somehow empty'; // Added fallback just in case, though template should ensure it exists.
  // Use the passed context for logging
  logger.debug("Processing echo resource logic", { ...context, message });

  // Prepare response data including timestamp and original URI
  return {
    message,
    timestamp: new Date().toISOString(),
    requestUri: uri.href
  };
};
