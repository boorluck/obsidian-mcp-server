import path from 'node:path'; // Using POSIX path functions for vault path manipulation
import { z } from 'zod';
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';

// ====================================================================================
// Schema Definitions for Input Validation
// ====================================================================================

/**
 * Zod schema for validating the input parameters of the 'obsidian_list_files' tool.
 */
export const ObsidianListFilesInputSchema = z.object({
  /**
   * The vault-relative path to the directory whose contents should be listed.
   * Examples: "Attachments/Images", "Projects", "" (for vault root), "/" (for vault root).
   * The path is treated as case-sensitive by the underlying Obsidian API.
   */
  dirPath: z.string()
    .describe('The vault-relative path to the directory to list (e.g., "developer/atlas-mcp-server", "/" for root). Case-sensitive.'),
  /**
   * Optional array of file extensions (including the leading dot) to filter the results.
   * Only files matching one of these extensions will be included. Directories are always included regardless of this filter.
   * Example: [".md", ".png"]
   */
  fileExtensionFilter: z.array(z.string().startsWith(".", "Extension must start with a dot '.'"))
    .optional()
    .describe('Optional array of file extensions (e.g., [".md") to filter files. Directories are always included.'),
  /**
   * Optional JavaScript-compatible regular expression pattern string to filter results by name.
   * Only files and directories whose names match the regex will be included.
   * Example: "^\\d{4}-\\d{2}-\\d{2}" (matches names starting with YYYY-MM-DD)
   */
  nameRegexFilter: z.string().optional()
    .describe('Optional regex pattern (JavaScript syntax) to filter results by name.'),
}).describe(
  'Input parameters for listing files and subdirectories within a specified Obsidian vault directory, with optional filtering.'
);

/**
 * TypeScript type inferred from the input schema (`ObsidianListFilesInputSchema`).
 * Represents the validated input parameters used within the core processing logic.
 */
export type ObsidianListFilesInput = z.infer<typeof ObsidianListFilesInputSchema>;

// ====================================================================================
// Response Type Definition
// ====================================================================================

/**
 * Defines the structure of the successful response returned by the `processObsidianListFiles` function.
 * This object is typically serialized to JSON and sent back to the client.
 */
export interface ObsidianListFilesResponse {
    /** The vault-relative path of the directory whose contents were listed (normalized, e.g., "/" for root). */
    directoryPath: string;
    /** A string representation of the directory contents formatted as a simple tree structure. */
    tree: string;
    /** The total number of files and directories included in the formatted tree after filtering. */
    totalEntries: number;
}

// ====================================================================================
// Helper Functions
// ====================================================================================

/**
 * Formats a list of file and directory names into a simple tree-like string representation.
 * Directories (indicated by a trailing '/') are listed first, then files, both sorted alphabetically.
 *
 * @param {string[]} fileNames - An array of file and directory names (directories should end with '/').
 * @returns {string} A formatted string representing the directory tree, or "(empty directory)" if the input array is empty.
 */
function formatAsTree(fileNames: string[]): string {
    if (!fileNames || fileNames.length === 0) {
        return '(empty directory)';
    }

    // Sort entries: directories first, then files, alphabetically within each group.
    fileNames.sort((a, b) => {
        const aIsDir = a.endsWith('/');
        const bIsDir = b.endsWith('/');

        // Group directories before files
        if (aIsDir && !bIsDir) return -1; // a (dir) comes before b (file)
        if (!aIsDir && bIsDir) return 1;  // b (dir) comes before a (file)

        // Within the same type (both dirs or both files), sort alphabetically.
        // Remove trailing slash for comparison if it's a directory.
        const nameA = aIsDir ? a.slice(0, -1) : a;
        const nameB = bIsDir ? b.slice(0, -1) : b;
        return nameA.localeCompare(nameB);
    });

    // Build the tree string with prefixes
    let treeString = '';
    const lastIndex = fileNames.length - 1;

    fileNames.forEach((name, index) => {
        const isLast = index === lastIndex;
        const prefix = isLast ? '└── ' : '├── '; // Use different connectors for the last item
        treeString += prefix + name + (isLast ? '' : '\n'); // Add newline except for the last item
    });

    return treeString;
}


// ====================================================================================
// Core Logic Function
// ====================================================================================

/**
 * Processes the core logic for listing files and directories within a specified
 * directory in the Obsidian vault. Applies optional filters and formats the output.
 *
 * @param {ObsidianListFilesInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and correlation.
 * @param {ObsidianRestApiService} obsidianService - An instance of the Obsidian REST API service.
 * @returns {Promise<ObsidianListFilesResponse>} A promise resolving to the structured success response
 *   containing the listed directory path, a formatted tree string, and the total entry count.
 * @throws {McpError} Throws an McpError if the directory cannot be listed (e.g., not found)
 *   or if any other API interaction or validation fails.
 */
export const processObsidianListFiles = async (
  params: ObsidianListFilesInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService
): Promise<ObsidianListFilesResponse> => {
  const { dirPath, fileExtensionFilter, nameRegexFilter } = params;
  // Normalize dirPath for logging and response (use "/" for root)
  const dirPathForLog = dirPath === "" || dirPath === "/" ? "/" : dirPath;

  logger.debug(`Processing obsidian_list_files request for path: ${dirPathForLog}`, { ...context, fileExtensionFilter, nameRegexFilter });

  try {
    // Normalize path for the API call as well
    const effectiveDirPath = dirPath === "" ? "/" : dirPath;

    // --- Step 1: Fetch initial list from Obsidian API ---
    const listContext = { ...context, operation: 'listFilesApiCall' };
    logger.debug(`Calling Obsidian API to list directory: ${effectiveDirPath}`, listContext);
    let fileNames = await obsidianService.listFiles(effectiveDirPath, listContext);
    logger.debug(`Successfully listed ${fileNames.length} initial items in: ${dirPathForLog}`, listContext);

    // --- Step 2: Apply Filters ---
    const filterContext = { ...context, operation: 'applyFilters' };

    // Apply extension filter if provided
    if (fileExtensionFilter && fileExtensionFilter.length > 0) {
      const initialCount = fileNames.length;
      fileNames = fileNames.filter(fileName => {
        // Always keep directories (identified by trailing '/')
        if (fileName.endsWith('/')) return true;
        // Check if the file's extension is in the filter list
        const extension = path.posix.extname(fileName); // Use path.posix.extname for consistency
        return fileExtensionFilter.includes(extension);
      });
      logger.debug(`Applied extension filter (${fileExtensionFilter.join(', ')}). ${initialCount} -> ${fileNames.length} items remaining.`, filterContext);
    }

    // Apply regex name filter if provided
    if (nameRegexFilter) {
      const initialCount = fileNames.length;
      try {
        const regex = new RegExp(nameRegexFilter); // Compile the regex pattern
        fileNames = fileNames.filter(fileName => regex.test(fileName)); // Test each name against the regex
        logger.debug(`Applied regex filter /${nameRegexFilter}/. ${initialCount} -> ${fileNames.length} items remaining.`, filterContext);
      } catch (regexError) {
         // Handle invalid regex patterns provided by the user
         logger.error(`Invalid regex pattern provided: ${nameRegexFilter}`, regexError instanceof Error ? regexError : undefined, filterContext);
         throw new McpError(
             BaseErrorCode.VALIDATION_ERROR, // It's an input validation issue
             `Invalid regex pattern provided for nameRegexFilter: ${nameRegexFilter}. Error: ${regexError instanceof Error ? regexError.message : 'Unknown regex error'}`,
             filterContext
         );
      }
    }

    // --- Step 3: Format Output and Return ---
    const formatContext = { ...context, operation: 'formatResponse' };
    const totalEntries = fileNames.length;
    logger.debug(`Formatting final list of ${totalEntries} entries as tree.`, formatContext);

    // Format the potentially filtered list into a tree string
    const treeString = formatAsTree(fileNames);

    // Construct the final response object
    const response: ObsidianListFilesResponse = {
        directoryPath: dirPathForLog, // Return the normalized path
        tree: treeString,
        totalEntries: totalEntries,
    };

    logger.debug(`Successfully processed list request for ${dirPathForLog}.`, context);
    return response;

  } catch (error) {
    // Handle errors, ensuring they are McpError instances before re-throwing.
    if (error instanceof McpError) {
       // Provide a more specific message if the directory wasn't found
       if (error.code === BaseErrorCode.NOT_FOUND) {
          logger.error(`Directory not found for listing: ${dirPathForLog}`, error, context);
          throw new McpError(error.code, `Directory not found for listing: ${dirPathForLog}`, context);
      }
      logger.error(`McpError during file listing for ${dirPathForLog}: ${error.message}`, error, context);
      throw error; // Re-throw known McpError
    } else {
      // Catch and wrap unexpected errors
      const errorMessage = `Unexpected error listing Obsidian files in ${dirPathForLog}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined, context);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`, context);
    }
  }
};
