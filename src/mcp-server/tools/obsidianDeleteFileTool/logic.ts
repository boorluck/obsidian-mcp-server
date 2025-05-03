import { z } from 'zod';
import path from 'node:path'; // Import path for directory/filename extraction
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';

// --- Schema and Type Definitions ---

export const ObsidianDeleteFileInputSchema = z.object({
  /** The vault-relative path to the file to be deleted (e.g., "Old Notes/Obsolete File.md"). Tries case-sensitive first, then attempts a case-insensitive fallback if not found. */
  filePath: z.string().min(1, "filePath cannot be empty").describe(
    'The vault-relative path to the file to be deleted (e.g., "Old Notes/Obsolete File.md"). Must include the file extension. Tries case-sensitive first, then attempts a case-insensitive fallback if not found.'
  ),
}).describe(
  'Input parameters for permanently deleting a specific file within the connected Obsidian vault. Includes a case-insensitive fallback if the exact path is not found.'
);

export type ObsidianDeleteFileInput = z.infer<typeof ObsidianDeleteFileInputSchema>;

// Updated Response Type
export interface ObsidianDeleteFileResponse {
  success: boolean;
  message: string;
  // timestamp: string; // REMOVED
}

// --- Helper Function to Format Timestamp ---

// --- Core Logic Function ---

/**
 * Processes the core logic for deleting a file from the Obsidian vault.
 *
 * @function processObsidianDeleteFile
 * @param {ObsidianDeleteFileInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @param {ObsidianRestApiService} obsidianService - The Obsidian REST API service instance.
 * @returns {Promise<ObsidianDeleteFileResponse>} Confirmation message with timestamp.
 * @throws {McpError} If the file cannot be deleted or the API request fails.
 */
export const processObsidianDeleteFile = async (
  params: ObsidianDeleteFileInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService // Inject the service instance
): Promise<ObsidianDeleteFileResponse> => {
  const originalFilePath = params.filePath;
  logger.debug(`Processing obsidian_delete_file request for path: ${originalFilePath}`, context);

  try {
    // Initial attempt with the provided path
    logger.debug(`Attempting to delete file (case-sensitive): ${originalFilePath}`, context);
    await obsidianService.deleteFile(originalFilePath, context);
    // const timestamp = formatTimestamp(new Date()); // REMOVED
    logger.debug(`Successfully deleted file (case-sensitive): ${originalFilePath}`, context);
    return {
        success: true,
        message: `File '${originalFilePath}' deleted successfully.`,
        // timestamp: timestamp // REMOVED
    };
  } catch (error) {
    // If the initial attempt failed with NOT_FOUND, try case-insensitive fallback
    if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
      logger.info(`File not found with exact path: ${originalFilePath}. Attempting case-insensitive fallback for deletion.`, context);

      try {
        // Extract directory and filename using POSIX separators
        const dirname = path.posix.dirname(originalFilePath);
        const filenameLower = path.posix.basename(originalFilePath).toLowerCase();
        const dirToList = dirname === '.' ? '/' : dirname; // Use root if dirname is '.'

        logger.debug(`Listing directory for fallback deletion: ${dirToList}`, context);
        const filesInDir = await obsidianService.listFiles(dirToList, context);

        const matches = filesInDir.filter(f =>
          !f.endsWith('/') && // Ensure it's a file
          path.posix.basename(f).toLowerCase() === filenameLower
        );

        if (matches.length === 1) {
          // Found exactly one case-insensitive match
          const correctFilename = path.posix.basename(matches[0]);
          const correctFilePath = path.posix.join(dirname, correctFilename);
          logger.info(`Found case-insensitive match: ${correctFilePath}. Retrying delete.`, context);

          // Retry deleting with the correct path
          await obsidianService.deleteFile(correctFilePath, context);
          // const timestamp = formatTimestamp(new Date()); // REMOVED
          logger.debug(`Successfully deleted file (case-insensitive fallback): ${correctFilePath}`, context);
          return {
              success: true,
              message: `File '${correctFilePath}' (found via case-insensitive match for '${originalFilePath}') deleted successfully.`,
              // timestamp: timestamp // REMOVED
          };

        } else if (matches.length > 1) {
          // Ambiguous match
          const errorMsg = `Deletion failed: Ambiguous case-insensitive matches for '${originalFilePath}'. Found: ${matches.join(', ')}.`;
          logger.error(errorMsg, { ...context, matches });
          throw new McpError(BaseErrorCode.NOT_FOUND, errorMsg, context);
        } else {
          // No match found even with fallback
          const errorMsg = `Deletion failed: File not found for '${originalFilePath}' (case-insensitive fallback also failed).`;
          logger.error(errorMsg, context);
          throw new McpError(BaseErrorCode.NOT_FOUND, errorMsg, context);
        }
      } catch (fallbackError) {
        // Handle errors during the fallback process itself
        if (fallbackError instanceof McpError) {
            throw fallbackError; // Re-throw known errors (like the NOT_FOUND from above)
        } else {
            const errorMessage = `Unexpected error during case-insensitive fallback deletion for ${originalFilePath}`;
            logger.error(errorMessage, fallbackError instanceof Error ? fallbackError : undefined, context);
            throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
        }
      }
    } else if (error instanceof McpError) {
      // Re-throw other McpErrors from the initial attempt
      throw error;
    } else {
      // Wrap unexpected errors from the initial attempt
      const errorMessage = `Unexpected error deleting Obsidian file ${originalFilePath}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined, context);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  }
};
