import { z } from 'zod';
import path from 'node:path'; // Import path for directory/filename extraction
import { logger, RequestContext } from '../../../utils/index.js';
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { NoteJson } from '../../../services/obsidianRestAPI/types.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- Schema and Type Definitions ---

const ReadFileFormatSchema = z.enum(['markdown', 'json']).default('markdown');

export const ObsidianReadFileInputSchema = z.object({
  /** The vault-relative path to the target file (e.g., "Folder/My Note.md"). Tries case-sensitive first, then attempts a case-insensitive fallback if not found. */
  filePath: z.string().min(1, "filePath cannot be empty").describe(
    'The vault-relative path to the target file (e.g., "Folder/My Note.md"). Must include the file extension. Tries case-sensitive first, then attempts a case-insensitive fallback if not found.'
  ),
  /** Specifies the format for the returned content. Defaults to 'markdown'. */
  format: ReadFileFormatSchema.optional().describe(
    "Specifies the format for the returned content. 'markdown' returns the raw file content as a string. 'json' returns a structured NoteJson object containing content, parsed frontmatter, tags, and file metadata (stat). Defaults to 'markdown'."
  ),
}).describe(
  'Defines the input parameters for retrieving the content of a specific file within the connected Obsidian vault. Includes a case-insensitive fallback if the exact path is not found.'
);

export type ObsidianReadFileInput = z.infer<typeof ObsidianReadFileInputSchema>;

// The response type can be either a string (markdown) or a NoteJson object
export type ObsidianReadFileResponse = string | NoteJson;

// --- Core Logic Function ---

/**
 * Processes the core logic for reading a file from the Obsidian vault.
 *
 * @function processObsidianReadFile
 * @param {ObsidianReadFileInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @param {ObsidianRestApiService} obsidianService - The Obsidian REST API service instance.
 * @returns {Promise<ObsidianReadFileResponse>} The file content as a string or NoteJson object.
 * @throws {McpError} If the file cannot be read or the API request fails.
 */
export const processObsidianReadFile = async (
  params: ObsidianReadFileInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService // Inject the service instance
): Promise<ObsidianReadFileResponse> => {
  logger.debug(`Processing obsidian_read_file request for path: ${params.filePath}`, { ...context, format: params.format });

  const originalFilePath = params.filePath;
  const format = params.format;

  try {
    // Initial attempt with the provided path
    logger.debug(`Attempting to read file (case-sensitive): ${originalFilePath}`, { ...context, format });
    const content = await obsidianService.getFileContent(originalFilePath, format, context);
    logger.debug(`Successfully read file (case-sensitive): ${originalFilePath}`, context);
    return content;
  } catch (error) {
    // If the initial attempt failed with NOT_FOUND, try case-insensitive fallback
    if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
      logger.info(`File not found with exact path: ${originalFilePath}. Attempting case-insensitive fallback.`, context); // Changed warn to info

      try {
        // Extract directory and filename using POSIX separators
        const dirname = path.posix.dirname(originalFilePath);
        const filenameLower = path.posix.basename(originalFilePath).toLowerCase();
        const dirToList = dirname === '.' ? '/' : dirname; // Use root if dirname is '.'

        logger.debug(`Listing directory for fallback: ${dirToList}`, context);
        const filesInDir = await obsidianService.listFiles(dirToList, context);

        const matches = filesInDir.filter(f =>
          !f.endsWith('/') && // Ensure it's a file, not a directory listing
          path.posix.basename(f).toLowerCase() === filenameLower
        );

        if (matches.length === 1) {
          // Found exactly one case-insensitive match
          const correctFilename = path.posix.basename(matches[0]); // Get the correctly cased filename
          const correctFilePath = path.posix.join(dirname, correctFilename); // Reconstruct the full path
          logger.info(`Found case-insensitive match: ${correctFilePath}. Retrying read.`, context);

          // Retry reading with the correct path
          const content = await obsidianService.getFileContent(correctFilePath, format, context);
          logger.debug(`Successfully read file (case-insensitive fallback): ${correctFilePath}`, context);
          return content;

        } else if (matches.length > 1) {
          // Ambiguous match
          logger.error(`Case-insensitive fallback failed: Multiple matches found for ${filenameLower} in ${dirToList}.`, { ...context, matches });
          throw new McpError(BaseErrorCode.NOT_FOUND, `File not found: Ambiguous case-insensitive matches for '${originalFilePath}'.`, context);
        } else {
          // No match found even with fallback
          logger.error(`Case-insensitive fallback failed: No match found for ${filenameLower} in ${dirToList}.`, context);
          throw new McpError(BaseErrorCode.NOT_FOUND, `File not found: '${originalFilePath}' (case-insensitive fallback also failed).`, context);
        }
      } catch (fallbackError) {
        // Handle errors during the fallback process itself (e.g., listFiles error)
        if (fallbackError instanceof McpError) {
            // If it's already an McpError (like the re-thrown NOT_FOUND), just re-throw
            throw fallbackError;
        } else {
            // Wrap unexpected errors during fallback
            const errorMessage = `Unexpected error during case-insensitive fallback for ${originalFilePath}`;
            logger.error(errorMessage, fallbackError instanceof Error ? fallbackError : undefined, context);
            throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
        }
      }
    } else if (error instanceof McpError) {
      // Re-throw other McpErrors from the initial attempt
      throw error;
    } else {
      // Wrap unexpected errors from the initial attempt
      const errorMessage = `Unexpected error reading Obsidian file ${originalFilePath}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined, context);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  }
};
