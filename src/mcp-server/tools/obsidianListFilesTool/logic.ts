import { z } from 'zod';
import path from 'node:path'; // Import path module
import { logger, RequestContext } from '../../../utils/index.js';
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- Schema and Type Definitions ---

export const ObsidianListFilesInputSchema = z.object({
  /** The vault-relative path to the directory whose contents should be listed (e.g., "Attachments/Images" or "Projects"). Use an empty string "" or "/" to list the contents of the vault root. Case-sensitive. */
  dirPath: z.string().describe(
    'The vault-relative path to the directory whose contents should be listed (e.g., "Attachments/Images" or "Projects"). Use an empty string "" or "/" to list the contents of the vault root. Case-sensitive.'
  ),
  /** Optional array of file extensions (including the dot, e.g., [".md", ".png"]) to filter the results. Only files matching these extensions will be returned. Directories are always included. */
  fileExtensionFilter: z.array(z.string().startsWith(".")).optional().describe(
    'Optional array of file extensions (including the dot, e.g., [".md", ".png"]) to filter the results. Only files matching these extensions will be returned. Directories are always included.'
  ),
  /** Optional regex pattern (JavaScript syntax) to filter results by name. Only files/directories matching the regex will be returned. */
  nameRegexFilter: z.string().optional().describe(
    'Optional regex pattern (JavaScript syntax) to filter results by name. Only files/directories matching the regex will be returned.'
  ),
}).describe(
  'Input parameters for listing the files and subdirectories within a specified directory in the connected Obsidian vault, with optional filtering by extension or regex.'
);

export type ObsidianListFilesInput = z.infer<typeof ObsidianListFilesInputSchema>;

// Response is an array of strings (file/directory names)
export type ObsidianListFilesResponse = string[];

// --- Core Logic Function ---

/**
 * Processes the core logic for listing files in an Obsidian vault directory.
 *
 * @function processObsidianListFiles
 * @param {ObsidianListFilesInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @param {ObsidianRestApiService} obsidianService - The Obsidian REST API service instance.
 * @returns {Promise<ObsidianListFilesResponse>} An array of file and directory names.
 * @throws {McpError} If the directory cannot be listed or the API request fails.
 */
export const processObsidianListFiles = async (
  params: ObsidianListFilesInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService // Inject the service instance
): Promise<ObsidianListFilesResponse> => {
  // Destructure params
  const { dirPath, fileExtensionFilter, nameRegexFilter } = params;
  // Define dirPathForLog once for logging and error messages
  const dirPathForLog = dirPath === "" ? "/" : dirPath;
  logger.debug(`Processing obsidian_list_files request for path: ${dirPathForLog}`, { ...context, fileExtensionFilter, nameRegexFilter });

  try {
    const effectiveDirPath = dirPath === "" ? "/" : dirPath;
    let files = await obsidianService.listFiles(effectiveDirPath, context);
    logger.debug(`Successfully listed ${files.length} initial items in: ${dirPathForLog}`, context);

    // Apply extension filter if provided
    if (fileExtensionFilter && fileExtensionFilter.length > 0) {
      files = files.filter(file => {
        // Always include directories (they end with '/')
        if (file.endsWith('/')) return true;
        // Check if file extension matches any in the filter array
        const extension = path.extname(file); // Use path.extname
        return fileExtensionFilter.includes(extension);
      });
      logger.debug(`Applied extension filter, ${files.length} items remaining.`, { ...context, fileExtensionFilter });
    }

    // Apply regex filter if provided
    if (nameRegexFilter) {
      try {
        const regex = new RegExp(nameRegexFilter);
        files = files.filter(file => regex.test(file));
        logger.debug(`Applied regex filter, ${files.length} items remaining.`, { ...context, nameRegexFilter });
      } catch (regexError) {
         logger.error(`Invalid regex pattern provided: ${nameRegexFilter}`, regexError instanceof Error ? regexError : undefined, context);
         throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid regex pattern provided for nameRegexFilter: ${nameRegexFilter}`, context);
      }
    }

    return files;

  } catch (error) {
    // Errors from obsidianService are already handled and logged
    if (error instanceof McpError) {
       // Customize error message if needed, e.g., for NOT_FOUND
       if (error.code === BaseErrorCode.NOT_FOUND) {
          throw new McpError(error.code, `Directory not found for listing: ${dirPathForLog}`, context);
      }
      throw error;
    } else {
      const errorMessage = `Unexpected error listing Obsidian files in ${dirPathForLog}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined, context);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  }
};
