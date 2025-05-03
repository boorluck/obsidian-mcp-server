import { z } from 'zod';
import path from 'node:path'; // Import path module
import { logger, RequestContext } from '../../../utils/index.js'; // Removed unused stat formatter import
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js'; // Removed unused NoteJson/NoteStat imports
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

// --- Updated Response Type ---
export interface ObsidianListFilesResponse {
    directoryPath: string; // The path that was listed
    tree: string;          // Formatted tree string representation
    totalEntries: number; // Total count of files/dirs listed
}

// --- Helper Function to Format as Tree ---
function formatAsTree(fileNames: string[]): string {
    if (!fileNames || fileNames.length === 0) {
        return '(empty directory)';
    }

    // Sort directories first, then files, alphabetically within type
    fileNames.sort((a, b) => {
        const aIsDir = a.endsWith('/');
        const bIsDir = b.endsWith('/');
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        // Extract base names for comparison (remove trailing slash for dirs)
        const nameA = aIsDir ? a.slice(0, -1) : a;
        const nameB = bIsDir ? b.slice(0, -1) : b;
        return nameA.localeCompare(nameB);
    });

    let treeString = '';
    const lastIndex = fileNames.length - 1;

    fileNames.forEach((name, index) => {
        const prefix = index === lastIndex ? '└── ' : '├── ';
        treeString += prefix + name + (index === lastIndex ? '' : '\n');
    });

    return treeString;
}


// --- Core Logic Function ---

/**
 * Processes the core logic for listing files in an Obsidian vault directory.
 * Returns detailed information including file stats.
 *
 * @function processObsidianListFiles
 * @param {ObsidianListFilesInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @param {ObsidianRestApiService} obsidianService - The Obsidian REST API service instance.
 * @returns {Promise<ObsidianListFilesResponse>} An object containing directory path, tree string, and entry count.
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
  const dirPathForLog = dirPath === "" || dirPath === "/" ? "/" : dirPath;
  logger.debug(`Processing obsidian_list_files request for path: ${dirPathForLog}`, { ...context, fileExtensionFilter, nameRegexFilter });

  try {
    const effectiveDirPath = dirPath === "" ? "/" : dirPath;
    let fileNames = await obsidianService.listFiles(effectiveDirPath, context);
    logger.debug(`Successfully listed ${fileNames.length} initial items in: ${dirPathForLog}`, context);

    // Apply extension filter if provided
    if (fileExtensionFilter && fileExtensionFilter.length > 0) {
      fileNames = fileNames.filter(fileName => {
        // Always include directories (they end with '/')
        if (fileName.endsWith('/')) return true;
        // Check if file extension matches any in the filter array
        const extension = path.extname(fileName); // Use path.extname
        return fileExtensionFilter.includes(extension);
      });
      logger.debug(`Applied extension filter, ${fileNames.length} items remaining.`, { ...context, fileExtensionFilter });
    }

    // Apply regex filter if provided
    if (nameRegexFilter) {
      try {
        const regex = new RegExp(nameRegexFilter);
        fileNames = fileNames.filter(fileName => regex.test(fileName));
        logger.debug(`Applied regex filter, ${fileNames.length} items remaining.`, { ...context, nameRegexFilter });
      } catch (regexError) {
         logger.error(`Invalid regex pattern provided: ${nameRegexFilter}`, regexError instanceof Error ? regexError : undefined, context);
         throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid regex pattern provided for nameRegexFilter: ${nameRegexFilter}`, context);
      }
    }

    const totalEntries = fileNames.length;

    // Format the filtered list as a tree string
    const treeString = formatAsTree(fileNames);

    return {
        directoryPath: dirPathForLog,
        tree: treeString,
        totalEntries: totalEntries,
    };

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
