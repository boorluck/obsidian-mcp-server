import { z } from 'zod';
import path from 'node:path'; // For file path fallback logic
import { logger, RequestContext } from '../../../utils/index.js';
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { Period } from '../../../services/obsidianRestAPI/types.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- Schema Definitions ---

const TargetTypeSchema = z.enum(['filePath', 'activeFile', 'periodicNote']);
const PeriodicNotePeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

const ReplacementBlockSchema = z.object({
  /** The exact string or regex pattern to search for. */
  search: z.string().min(1, "Search pattern cannot be empty."),
  /** The string to replace matches with. */
  replace: z.string(), // Allow empty string for deletion
});

// Define the base schema object first
const BaseObsidianSearchReplaceInputSchema = z.object({
  /** Specifies the target note: 'filePath', 'activeFile', or 'periodicNote'. */
  targetType: TargetTypeSchema.describe("Specifies the target note: 'filePath', 'activeFile', or 'periodicNote'."),
  /** Required if targetType is 'filePath' (vault-relative path) or 'periodicNote' (period string: 'daily', etc.). Tries case-insensitive fallback for filePath. */
  targetIdentifier: z.string().optional().describe(
    "Required if targetType is 'filePath' (vault-relative path) or 'periodicNote' (period string: 'daily', etc.). Tries case-insensitive fallback for filePath."
  ),
  /** An array of search/replace operations to perform sequentially. */
  replacements: z.array(ReplacementBlockSchema).min(1, "Replacements array cannot be empty.").describe(
    "An array of search/replace operations to perform sequentially."
  ),
  /** If true, treat the 'search' field in replacements as JavaScript regex patterns. Defaults to false (exact string matching). */
  useRegex: z.boolean().optional().default(false).describe(
    "If true, treat the 'search' field in replacements as JavaScript regex patterns. Defaults to false (exact string matching)."
  ),
  /** If true (default), replace all occurrences for each search pattern. If false, replace only the first occurrence. */
  replaceAll: z.boolean().optional().default(true).describe(
    "If true (default), replace all occurrences for each search pattern. If false, replace only the first occurrence."
  ),
  /** If true (default), the search is case-sensitive. If false, it's case-insensitive. Applies to both string and regex search. */
  caseSensitive: z.boolean().optional().default(true).describe(
    "If true (default), the search is case-sensitive. If false, it's case-insensitive. Applies to both string and regex search."
  ),
});


// Now, define the refined schema using the base schema
export const ObsidianSearchReplaceInputSchema = BaseObsidianSearchReplaceInputSchema.refine(data => {
    // Validate targetIdentifier based on targetType
    if ((data.targetType === 'filePath' || data.targetType === 'periodicNote') && !data.targetIdentifier) {
      return false;
    }
    if (data.targetType === 'periodicNote' && data.targetIdentifier && !PeriodicNotePeriodSchema.safeParse(data.targetIdentifier).success) {
        return false;
    }
    return true;
  }, {
    message: "targetIdentifier is required and must be a valid path for targetType 'filePath', or a valid period ('daily', 'weekly', etc.) for targetType 'periodicNote'.",
    path: ["targetIdentifier"],
  }).describe(
    "Performs search and replace operations within a target Obsidian note (file path, active, or periodic). Reads the file, applies replacements sequentially, and writes the modified content back."
  );

// Export the shape of the base schema for registration
export const ObsidianSearchReplaceInputSchemaShape = BaseObsidianSearchReplaceInputSchema.shape;
// Export the inferred type from the base schema for the handler signature
export type ObsidianSearchReplaceRegistrationInput = z.infer<typeof BaseObsidianSearchReplaceInputSchema>;

// Type derived from the *refined* schema for internal logic
export type ObsidianSearchReplaceInput = z.infer<typeof ObsidianSearchReplaceInputSchema>;

// Response indicates success and number of replacements
export interface ObsidianSearchReplaceResponse {
  success: boolean;
  message: string;
  totalReplacementsMade: number; // Count total replacements across all blocks
}

// --- Core Logic Function ---

/**
 * Processes search and replace operations within an Obsidian note.
 */
export const processObsidianSearchReplace = async (
  params: ObsidianSearchReplaceInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService
): Promise<ObsidianSearchReplaceResponse> => {
  const { targetType, targetIdentifier, replacements, useRegex, replaceAll, caseSensitive } = params;
  let effectiveFilePath = targetIdentifier; // Used for filePath targets, potentially updated by fallback
  let targetDescription = targetIdentifier ?? 'active file'; // For logging/errors

  logger.debug(`Processing obsidian_search_replace request`, { ...context, targetType, targetIdentifier });

  // --- 1. Read File Content (with filePath fallback) ---
  let originalContent: string;
  try {
    if (targetType === 'filePath') {
      if (!targetIdentifier) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "targetIdentifier is required for targetType 'filePath'.", context);
      targetDescription = targetIdentifier;
      try {
        // Attempt case-sensitive read first
        logger.debug(`Attempting to read file (case-sensitive): ${targetIdentifier}`, context);
        originalContent = await obsidianService.getFileContent(targetIdentifier, 'markdown', context) as string;
        effectiveFilePath = targetIdentifier; // Confirm exact path worked
      } catch (readError) {
        if (readError instanceof McpError && readError.code === BaseErrorCode.NOT_FOUND) {
          // Attempt case-insensitive fallback
          logger.info(`File not found with exact path: ${targetIdentifier}. Attempting case-insensitive fallback.`, context);
          const dirname = path.posix.dirname(targetIdentifier);
          const filenameLower = path.posix.basename(targetIdentifier).toLowerCase();
          const dirToList = dirname === '.' ? '/' : dirname;
          const filesInDir = await obsidianService.listFiles(dirToList, context);
          const matches = filesInDir.filter(f => !f.endsWith('/') && path.posix.basename(f).toLowerCase() === filenameLower);

          if (matches.length === 1) {
            const correctFilename = path.posix.basename(matches[0]);
            effectiveFilePath = path.posix.join(dirname, correctFilename); // Update effective path
            targetDescription = effectiveFilePath; // Update description for logs
            logger.info(`Found case-insensitive match: ${effectiveFilePath}. Reading content.`, context);
            originalContent = await obsidianService.getFileContent(effectiveFilePath, 'markdown', context) as string;
          } else {
            const errorMsg = matches.length > 1
              ? `Read failed: Ambiguous case-insensitive matches for '${targetIdentifier}'.`
              : `Read failed: File not found for '${targetIdentifier}' (case-insensitive fallback also failed).`;
            logger.error(errorMsg, { ...context, matches });
            throw new McpError(BaseErrorCode.NOT_FOUND, errorMsg, context);
          }
        } else {
          throw readError; // Re-throw other read errors
        }
      }
    } else if (targetType === 'activeFile') {
      originalContent = await obsidianService.getActiveFile('markdown', context) as string;
    } else { // periodicNote
      if (!targetIdentifier) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "targetIdentifier is required for targetType 'periodicNote'.", context);
      const period = PeriodicNotePeriodSchema.parse(targetIdentifier); // Already validated by refine
      targetDescription = `periodic note ${period}`;
      originalContent = await obsidianService.getPeriodicNote(period, 'markdown', context) as string;
    }
  } catch (error) {
     // Handle errors during the initial read phase
     if (error instanceof McpError) throw error;
     const errorMessage = `Unexpected error reading target ${targetDescription} before search/replace.`;
     logger.error(errorMessage, error instanceof Error ? error : undefined, context);
     throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
  }

  // --- 2. Perform Replacements ---
  let modifiedContent = originalContent;
  let totalReplacementsMade = 0;

  for (const rep of replacements) {
    let currentReplacements = 0;
    try {
      if (useRegex) {
        // Build regex flags
        let flags = '';
        if (replaceAll) flags += 'g';
        if (!caseSensitive) flags += 'i';
        const regex = new RegExp(rep.search, flags);
        // Count matches before replacing if needed (less efficient but accurate)
        if (replaceAll) {
            const matches = modifiedContent.match(regex);
            currentReplacements = matches ? matches.length : 0;
        } else {
            currentReplacements = regex.test(modifiedContent) ? 1 : 0;
        }
        modifiedContent = modifiedContent.replace(regex, rep.replace);
      } else {
        // Simple string replacement
        const searchString = caseSensitive ? rep.search : rep.search.toLowerCase();
        const contentForSearch = caseSensitive ? modifiedContent : modifiedContent.toLowerCase();
        let index = contentForSearch.indexOf(searchString);
        let startIndex = 0;

        while (index !== -1) {
          currentReplacements++;
          // Perform replacement on the original case content
          modifiedContent = modifiedContent.substring(0, index) + rep.replace + modifiedContent.substring(index + rep.search.length);
          if (!replaceAll) break; // Stop after first replacement if needed
          // Find next occurrence
          startIndex = index + rep.replace.length; // Start search after the replacement
          index = (caseSensitive ? modifiedContent : modifiedContent.toLowerCase()).indexOf(searchString, startIndex);
        }
      }
      totalReplacementsMade += currentReplacements;
      logger.debug(`Performed ${currentReplacements} replacements for search: "${rep.search}"`, context);
    } catch (error) {
        const errorMessage = `Error during replacement for search pattern "${rep.search}"`;
        logger.error(errorMessage, error instanceof Error ? error : undefined, context);
        // Decide whether to continue or fail all? For now, fail fast.
        throw new McpError(BaseErrorCode.INTERNAL_ERROR, `${errorMessage}: ${error instanceof Error ? error.message : 'Unknown error'}`, context);
    }
  }

  // --- 3. Write Modified Content Back ---
  // Only write if content actually changed
  if (modifiedContent !== originalContent) {
    try {
      logger.debug(`Writing modified content back to ${targetDescription}`, context);
      if (targetType === 'filePath') {
        // Use effectiveFilePath which might have been corrected by fallback
        await obsidianService.updateFileContent(effectiveFilePath!, modifiedContent, context);
      } else if (targetType === 'activeFile') {
        await obsidianService.updateActiveFile(modifiedContent, context);
      } else { // periodicNote
        const period = PeriodicNotePeriodSchema.parse(targetIdentifier!);
        await obsidianService.updatePeriodicNote(period, modifiedContent, context);
      }
      logger.info(`Successfully updated ${targetDescription} with ${totalReplacementsMade} replacements.`, context);
    } catch (error) {
       // Handle errors during the write phase
       if (error instanceof McpError) throw error;
       const errorMessage = `Unexpected error writing modified content to ${targetDescription}.`;
       logger.error(errorMessage, error instanceof Error ? error : undefined, context);
       throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  } else {
      logger.info(`No changes made to ${targetDescription} after search/replace operations.`, context);
  }

  return {
    success: true,
    message: `Search/replace completed on ${targetDescription}. ${totalReplacementsMade} replacement(s) made.`,
    totalReplacementsMade,
  };
};
