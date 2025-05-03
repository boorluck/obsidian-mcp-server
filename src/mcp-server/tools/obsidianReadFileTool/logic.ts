import { z } from 'zod';
import path from 'node:path'; // Import path for directory/filename extraction
import { logger, RequestContext, createFormattedStatWithTokenCount } from '../../../utils/index.js'; // Use new utility name
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { NoteJson, NoteStat } from '../../../services/obsidianRestAPI/types.js'; // Import NoteStat
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- Schema and Type Definitions ---

const ReadFileFormatSchema = z.enum(['markdown', 'json']).default('markdown');

// Updated Input Schema
export const ObsidianReadFileInputSchema = z.object({
  /** The vault-relative path to the target file (e.g., "Folder/My Note.md"). Tries case-sensitive first, then attempts a case-insensitive fallback if not found. */
  filePath: z.string().min(1, "filePath cannot be empty").describe(
    'The vault-relative path to the target file (e.g., "Folder/My Note.md"). Must include the file extension. Tries case-sensitive first, then attempts a case-insensitive fallback if not found.'
  ),
  /** Specifies the format for the returned content. Defaults to 'markdown'. */
  format: ReadFileFormatSchema.optional().describe(
    "Specifies the format for the returned content. 'markdown' returns the raw file content as a string. 'json' returns a structured NoteJson object containing content, parsed frontmatter, tags, and file metadata (stat). Defaults to 'markdown'."
  ),
  /** If true and format is 'markdown', includes file stats (creationTime, modifiedTime, size) in the response. Defaults to false. Ignored if format is 'json' (stats always included). */
  includeStat: z.boolean().optional().default(false).describe(
    "If true and format is 'markdown', includes file stats (creationTime, modifiedTime, size) in the response. Defaults to false. Ignored if format is 'json' (stats always included)."
  ),
}).describe(
  'Defines the input parameters for retrieving the content and optionally metadata of a specific file within the connected Obsidian vault. Includes a case-insensitive fallback if the exact path is not found.'
);

export type ObsidianReadFileInput = z.infer<typeof ObsidianReadFileInputSchema>;

// --- Enhanced Response Type ---
// Define the *new* Stat type containing formatted timestamps and token count
type FormattedStat = { createdTime: string; modifiedTime: string; tokenCountEstimate: number }; // Updated fields

// Response is now always an object
export interface ObsidianReadFileResponse {
    content: string | NoteJson; // Content in the requested format (or the full NoteJson if format='json')
    // timestamp: string; // REMOVED
    stat?: FormattedStat; // Use the updated formatted stat type, make optional
}

// Helper function to map NoteStat to FileStat - REMOVED (using addFormattedTimestampsToStat)


// --- Helper Function to Format Timestamp ---
// REMOVED - Now using shared utility


// --- Core Logic Function ---

/**
 * Processes the core logic for reading a file from the Obsidian vault.
 * Always fetches JSON internally to get stats, then formats the response.
 *
 * @function processObsidianReadFile
 * @param {ObsidianReadFileInput} params - The validated input parameters.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @param {ObsidianRestApiService} obsidianService - The Obsidian REST API service instance.
 * @returns {Promise<ObsidianReadFileResponse>} An object containing content, timestamp, and optional stats.
 * @throws {McpError} If the file cannot be read or the API request fails.
 */
export const processObsidianReadFile = async (
  params: ObsidianReadFileInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService // Inject the service instance
): Promise<ObsidianReadFileResponse> => {
  logger.debug(`Processing obsidian_read_file request for path: ${params.filePath}`, { ...context, format: params.format, includeStat: params.includeStat });

  const originalFilePath = params.filePath;
  const requestedFormat = params.format ?? 'markdown'; // Default to markdown if not provided
  const includeStat = params.includeStat;
  let effectiveFilePath = originalFilePath; // Track the path used after potential fallback

  try {
    let noteJson: NoteJson;
    // --- Read File (always fetch JSON internally, handle fallback) ---
    try {
      // Initial attempt with the provided path, fetching JSON
      logger.debug(`Attempting to read file as JSON (case-sensitive): ${originalFilePath}`, context);
      noteJson = await obsidianService.getFileContent(originalFilePath, 'json', context) as NoteJson;
      effectiveFilePath = originalFilePath; // Confirm exact path worked
      logger.debug(`Successfully read file as JSON (case-sensitive): ${originalFilePath}`, context);
    } catch (error) {
      // If the initial attempt failed with NOT_FOUND, try case-insensitive fallback
      if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
        logger.info(`File not found with exact path: ${originalFilePath}. Attempting case-insensitive fallback.`, context);

        try {
          // Extract directory and filename using POSIX separators
          const dirname = path.posix.dirname(originalFilePath);
          const filenameLower = path.posix.basename(originalFilePath).toLowerCase();
          const dirToList = dirname === '.' ? '/' : dirname; // Use root if dirname is '.'

          logger.debug(`Listing directory for fallback: ${dirToList}`, context);
          const filesInDir = await obsidianService.listFiles(dirToList, context);

          const matches = filesInDir.filter(f =>
            !f.endsWith('/') && // Ensure it's a file
            path.posix.basename(f).toLowerCase() === filenameLower
          );

          if (matches.length === 1) {
            // Found exactly one case-insensitive match
            const correctFilename = path.posix.basename(matches[0]);
            effectiveFilePath = path.posix.join(dirname, correctFilename); // Update effective path
            logger.info(`Found case-insensitive match: ${effectiveFilePath}. Retrying read as JSON.`, context);

            // Retry reading with the correct path, fetching JSON
            noteJson = await obsidianService.getFileContent(effectiveFilePath, 'json', context) as NoteJson;
            logger.debug(`Successfully read file as JSON (case-insensitive fallback): ${effectiveFilePath}`, context);

          } else if (matches.length > 1) {
            logger.error(`Case-insensitive fallback failed: Multiple matches found for ${filenameLower} in ${dirToList}.`, { ...context, matches });
            throw new McpError(BaseErrorCode.NOT_FOUND, `File not found: Ambiguous case-insensitive matches for '${originalFilePath}'.`, context);
          } else {
            logger.error(`Case-insensitive fallback failed: No match found for ${filenameLower} in ${dirToList}.`, context);
            throw new McpError(BaseErrorCode.NOT_FOUND, `File not found: '${originalFilePath}' (case-insensitive fallback also failed).`, context);
          }
        } catch (fallbackError) {
          if (fallbackError instanceof McpError) throw fallbackError;
          const errorMessage = `Unexpected error during case-insensitive fallback for ${originalFilePath}`;
          logger.error(errorMessage, fallbackError instanceof Error ? fallbackError : undefined, context);
          throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
        }
      } else if (error instanceof McpError) {
        throw error; // Re-throw other McpErrors from the initial attempt
      } else {
        throw error; // Re-throw unexpected errors from initial attempt
      }
    }

    // --- Format Response ---
    // const timestamp = formatTimestamp(new Date()); // REMOVED
    // Create the formatted stat object using the new utility, passing content, handle potential null return
    const formattedStatResult = noteJson.stat
        ? await createFormattedStatWithTokenCount(noteJson.stat, noteJson.content ?? '', context) // Pass content, await
        : undefined;
    const formattedStat = formattedStatResult === null ? undefined : formattedStatResult; // Convert null to undefined

    const response: ObsidianReadFileResponse = {
        content: '', // Placeholder, will be overwritten
        // timestamp: timestamp, // REMOVED
        // Stat is included conditionally based on format/flag
    };

    if (requestedFormat === 'json') {
        // For JSON format, return the full NoteJson object as content,
        // but replace its internal stat with the formatted one.
        // Also include the formatted stat at the top level.
        if (noteJson.stat) {
             // Replace the original stat in noteJson with the formatted one
             (noteJson as any).stat = formattedStat; // Use 'any' for simplicity or define a new type
        }
        response.content = noteJson;
        response.stat = formattedStat; // Include the formatted stat at the top level
    } else { // markdown format
        response.content = noteJson.content ?? ''; // Use the content string from NoteJson
        if (includeStat) {
            response.stat = formattedStat; // Include formatted stats only if requested for markdown
        }
    }

    return response;

  } catch (error) {
     // Catch errors from the outer try block (initial read or fallback logic)
     if (error instanceof McpError) {
        throw error;
     } else {
        // Wrap unexpected errors
        const errorMessage = `Unexpected error processing read request for ${originalFilePath}`;
        logger.error(errorMessage, error instanceof Error ? error : undefined, context);
        throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
     }
  }
};
