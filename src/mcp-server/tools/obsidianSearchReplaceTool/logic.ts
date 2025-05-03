import path from 'node:path'; // For file path fallback logic
import { z } from 'zod';
import { ObsidianRestApiService, NoteJson, NoteStat } from '../../../services/obsidianRestAPI/index.js'; // Added NoteStat
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext, createFormattedStatWithTokenCount } from '../../../utils/index.js'; // Use new utility name

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
  /** If true, treats sequences of whitespace in the search string (when useRegex=false) as matching one or more whitespace characters (\s+). Defaults to false. */
  flexibleWhitespace: z.boolean().optional().default(false).describe(
    "If true, treats sequences of whitespace in the search string (when useRegex=false) as matching one or more whitespace characters (\\s+). Defaults to false."
  ),
  /** If true, ensures the search term matches only whole words using word boundaries (\b). Applies to both regex and non-regex modes. Defaults to false. */
  wholeWord: z.boolean().optional().default(false).describe(
    "If true, ensures the search term matches only whole words using word boundaries (\\b). Applies to both regex and non-regex modes. Defaults to false."
  ),
  /** If true, returns the final content of the file in the response. Defaults to false. */
  returnContent: z.boolean().optional().default(false).describe(
    "If true, returns the final content of the file in the response. Defaults to false."
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
    // Add validation: flexibleWhitespace only applies when useRegex is false
    if (data.flexibleWhitespace && data.useRegex) {
        return false;
    }
    return true;
  }, {
    message: "targetIdentifier is required and must be a valid path for targetType 'filePath', or a valid period ('daily', 'weekly', etc.) for targetType 'periodicNote'. flexibleWhitespace cannot be true if useRegex is true.",
    path: ["targetIdentifier", "flexibleWhitespace"], // Point error to relevant fields
  }).describe(
    "Performs one or more search-and-replace operations within a target Obsidian note (file path, active, or periodic). Reads the file, applies replacements sequentially in memory, and writes the modified content back, overwriting the original. Supports string/regex search, case sensitivity toggle, replacing first/all occurrences, flexible whitespace matching (non-regex), and whole word matching."
  );

// Export the shape of the base schema for registration
export const ObsidianSearchReplaceInputSchemaShape = BaseObsidianSearchReplaceInputSchema.shape;
// Export the inferred type from the base schema for the handler signature
export type ObsidianSearchReplaceRegistrationInput = z.infer<typeof BaseObsidianSearchReplaceInputSchema>;

// Type derived from the *refined* schema for internal logic
export type ObsidianSearchReplaceInput = z.infer<typeof ObsidianSearchReplaceInputSchema>;

// --- Response Type ---
// Define the *new* Stat type containing formatted timestamps and token count
type FormattedStat = { createdTime: string; modifiedTime: string; tokenCountEstimate: number }; // Updated fields

export interface ObsidianSearchReplaceResponse {
  success: boolean;
  message: string;
  totalReplacementsMade: number; // Count total replacements across all blocks
  // timestamp: string; // REMOVED
  stat?: FormattedStat; // Use the updated formatted stat type
  finalContent?: string; // Added optional final content
}

// Helper function to escape regex special characters
function escapeRegex(string: string): string {
  // Escape characters with special meaning in regex.
  // Added escaping for hyphen (-) as well.
  return string.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'); // $& means the whole matched string
}

// --- Helper Function to Get Final State (Similar to updateFile) ---
async function getFinalState(
    targetType: z.infer<typeof TargetTypeSchema>,
    effectiveFilePath: string | undefined, // Use the potentially corrected path
    period: z.infer<typeof PeriodicNotePeriodSchema> | undefined,
    obsidianService: ObsidianRestApiService,
    context: RequestContext
): Promise<NoteJson | null> {
    try {
        let noteJson: NoteJson | null = null;
        if (targetType === 'filePath' && effectiveFilePath) {
            noteJson = await obsidianService.getFileContent(effectiveFilePath, 'json', context) as NoteJson;
        } else if (targetType === 'activeFile') {
            noteJson = await obsidianService.getActiveFile('json', context) as NoteJson;
        } else if (targetType === 'periodicNote' && period) {
            noteJson = await obsidianService.getPeriodicNote(period, 'json', context) as NoteJson;
        }
        return noteJson;
    } catch (error) {
        // Log warning but don't pass the error object directly to logger.warning
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warning(`Could not retrieve final state after search/replace. Error: ${errorMsg}`, context);
        return null;
    }
}

// --- Helper Function to Format Timestamp ---
// REMOVED - Now using shared utility


// --- Core Logic Function ---

/**
 * Processes search and replace operations within an Obsidian note.
 */
export const processObsidianSearchReplace = async (
  params: ObsidianSearchReplaceInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService
): Promise<ObsidianSearchReplaceResponse> => {
  // Destructure all params including new ones
  const {
      targetType,
      targetIdentifier,
      replacements,
      useRegex: initialUseRegex, // Rename to avoid conflict inside loop
      replaceAll,
      caseSensitive,
      flexibleWhitespace,
      wholeWord,
      returnContent // Added returnContent
  } = params;
  let effectiveFilePath = targetIdentifier; // Used for filePath targets, potentially updated by fallback
  let targetDescription = targetIdentifier ?? 'active file'; // For logging/errors
  let targetPeriod: z.infer<typeof PeriodicNotePeriodSchema> | undefined;

  logger.debug(`Processing obsidian_search_replace request`, { ...context, targetType, targetIdentifier, initialUseRegex, flexibleWhitespace, wholeWord, returnContent });

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
          const dirToList = dirname === '.' ? '/' : dirname; // Use root if dirname is '.'
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
      targetPeriod = PeriodicNotePeriodSchema.parse(targetIdentifier); // Already validated by refine
      targetDescription = `periodic note ${targetPeriod}`;
      originalContent = await obsidianService.getPeriodicNote(targetPeriod, 'markdown', context) as string;
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
    let finalSearchPattern: string | RegExp = rep.search;
    let useRegexForThisRep = initialUseRegex; // Start with the initial setting

    try {
      // --- Prepare Search Pattern ---
      if (!initialUseRegex) {
        // Handle non-regex options: flexibleWhitespace and wholeWord
        let searchStr = rep.search;
        if (flexibleWhitespace) {
          // Convert to regex: escape special chars, replace whitespace sequences with \s+
          searchStr = escapeRegex(searchStr).replace(/\s+/g, '\\s+');
          useRegexForThisRep = true; // Treat as regex now
          logger.debug(`Applying flexibleWhitespace: "${rep.search}" -> /${searchStr}/`, context);
        }
        if (wholeWord) {
          // Add word boundaries (\b)
          // If flexibleWhitespace was also true, searchStr is already a regex string
          // Otherwise, escape the original string first
          const baseStr = useRegexForThisRep ? searchStr : escapeRegex(searchStr);
          searchStr = `\\b${baseStr}\\b`;
          useRegexForThisRep = true; // Definitely treat as regex now
          logger.debug(`Applying wholeWord: "${rep.search}" -> /${searchStr}/`, context);
        }
        finalSearchPattern = searchStr; // Update the pattern to use

      } else if (wholeWord) {
        // Initial useRegex is true, apply wholeWord if boundaries aren't obvious
        let searchStr = rep.search;
        // Check if the pattern already starts/ends with word boundary, ^, or $
        const hasBoundary = /(?:^|\\b)\S.*\S(?:$|\\b)|^\S$|^\S.*\S$|^$/.test(searchStr) || /^\^|\\b/.test(searchStr) || /\$|\\b$/.test(searchStr);
        if (!hasBoundary) {
            searchStr = `\\b${searchStr}\\b`;
            // Use logger.warning for potential issues
            logger.warning(`Applying wholeWord=true to user-provided regex. Original: /${rep.search}/, Modified: /${searchStr}/. This might affect complex regexes.`, context);
            finalSearchPattern = searchStr; // Update the pattern
        } else {
             logger.debug(`wholeWord=true but user regex already contains boundary-like anchors: /${searchStr}/`, context);
        }
      }

      // --- Execute Replacement ---
      if (useRegexForThisRep) {
        // Build regex flags
        let flags = '';
        if (replaceAll) flags += 'g';
        if (!caseSensitive) flags += 'i';
        const regex = new RegExp(finalSearchPattern as string, flags); // Cast as string, it was prepared above
        // Count matches before replacing
        const matches = modifiedContent.match(regex);
        currentReplacements = matches ? matches.length : 0;
        if (!replaceAll && currentReplacements > 1) {
            currentReplacements = 1; // Only count 1 if replaceAll is false
        }
        // Perform replacement
        if (currentReplacements > 0) {
            if (replaceAll) {
                modifiedContent = modifiedContent.replace(regex, rep.replace);
            } else {
                // Replace only the first occurrence
                modifiedContent = modifiedContent.replace(regex, rep.replace);
            }
        }
      } else {
        // Simple string replacement (only if no options like wholeWord/flexibleWhitespace were applied)
        const searchString = caseSensitive ? finalSearchPattern as string : (finalSearchPattern as string).toLowerCase();
        let startIndex = 0;
        let replacedCount = 0; // Track replacements for this block

        while (true) { // Loop until break
            const contentForSearch = caseSensitive ? modifiedContent.substring(startIndex) : modifiedContent.substring(startIndex).toLowerCase();
            const indexInSubstring = contentForSearch.indexOf(searchString);

            if (indexInSubstring === -1) {
                break; // No more matches
            }

            const indexInOriginal = startIndex + indexInSubstring; // Actual index in modifiedContent

            replacedCount++;
            currentReplacements++; // Increment total for this block

            // Perform replacement on the original case content
            modifiedContent = modifiedContent.substring(0, indexInOriginal) +
                              rep.replace +
                              modifiedContent.substring(indexInOriginal + rep.search.length); // Use original rep.search.length

            if (!replaceAll) {
                break; // Stop after first replacement
            }

            // Find next occurrence: Start search immediately after the inserted replacement
            startIndex = indexInOriginal + rep.replace.length;

            // Prevent infinite loops if search string is empty or replacement contains search string
             if (rep.search.length === 0 || startIndex > modifiedContent.length) {
                 // Use logger.warning for potential issues
                 logger.warning(`Potential infinite loop detected or search index out of bounds during string replacement for "${rep.search}". Breaking loop.`, context);
                 break;
             }
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
  let finalState: NoteJson | null = null;
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
        await obsidianService.updatePeriodicNote(targetPeriod!, modifiedContent, context);
      }
      logger.info(`Successfully updated ${targetDescription} with ${totalReplacementsMade} replacements.`, context);

      // Get final state AFTER writing
      finalState = await getFinalState(targetType, effectiveFilePath, targetPeriod, obsidianService, context);

    } catch (error) {
       // Handle errors during the write phase
       if (error instanceof McpError) throw error;
       const errorMessage = `Unexpected error writing modified content to ${targetDescription}.`;
       logger.error(errorMessage, error instanceof Error ? error : undefined, context);
       throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  } else {
      logger.info(`No changes made to ${targetDescription} after search/replace operations.`, context);
      // Get state even if no changes were made, as mtime might not change but we still want timestamp/size
      finalState = await getFinalState(targetType, effectiveFilePath, targetPeriod, obsidianService, context);
  }

  // const timestamp = formatTimestamp(new Date()); // REMOVED
  const message = totalReplacementsMade > 0
      ? `Search/replace completed on ${targetDescription}. ${totalReplacementsMade} replacement(s) made.`
      : `Search/replace completed on ${targetDescription}. No replacements made.`;

  // --- Build Response ---
  // Create the formatted stat object using the new utility, passing content, handle potential null return
  const finalContentForStat = finalState?.content ?? modifiedContent; // Use final state content if available, else modified content
  const formattedStatResult = finalState?.stat
      ? await createFormattedStatWithTokenCount(finalState.stat, finalContentForStat, context) // Pass content, await
      : undefined;
  const formattedStat = formattedStatResult === null ? undefined : formattedStatResult; // Convert null to undefined

  const response: ObsidianSearchReplaceResponse = {
    success: true,
    message: message,
    totalReplacementsMade,
    // timestamp: timestamp, // REMOVED
    stat: formattedStat, // Use the new formatted stat object
  };

  if (returnContent) {
      // Use the content from the final state if available, otherwise fallback to modifiedContent
      response.finalContent = finalState?.content ?? modifiedContent;
  }

  return response;
};
