import { z } from 'zod';
import { logger, RequestContext } from '../../../utils/index.js';
import { ObsidianRestApiService } from '../../../services/obsidianRestAPI/index.js';
import { NoteJson, PatchOptions, Period } from '../../../services/obsidianRestAPI/types.js'; // Import NoteJson
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- Schema Definitions ---

const TargetTypeSchema = z.enum(['filePath', 'activeFile', 'periodicNote']);
const ModificationTypeSchema = z.enum(['wholeFile', 'patch']);
const WholeFileModeSchema = z.enum(['append', 'prepend', 'overwrite']);
const PatchOperationSchema = z.enum(['append', 'prepend', 'replace']);
const PatchTargetTypeSchema = z.enum(['heading', 'block', 'frontmatter']);
const PeriodicNotePeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

// Base schema containing common fields
const BaseUpdateSchema = z.object({
  /** Specifies the type of target note. */
  targetType: TargetTypeSchema.describe('Specifies the type of target note.'),
  /** The content to use for the modification. String for whole-file, string or object for patch. */
  content: z.union([z.string(), z.record(z.any())]).describe(
    'The content to use for the modification (string for whole-file, string or object for patch).'
  ),
  /** Required if targetType is 'filePath' (provide vault-relative path) or 'periodicNote' (provide period like 'daily'). Not used for 'activeFile'. */
  targetIdentifier: z.string().optional().describe(
    "Required if targetType is 'filePath' (provide vault-relative path) or 'periodicNote' (provide period like 'daily', 'weekly'). Not used for 'activeFile'."
  ),
});

// Schema for 'wholeFile' modification type
const WholeFileUpdateSchema = BaseUpdateSchema.extend({
  modificationType: z.literal(ModificationTypeSchema.enum.wholeFile),
  /** The specific whole-file operation. */
  wholeFileMode: WholeFileModeSchema.describe('The specific whole-file operation.'),
  /** If true, creates the target file/note if it doesn't exist before applying the modification. */
  createIfNeeded: z.boolean().optional().default(true).describe(
    "If true, creates the target file/note if it doesn't exist before applying the modification."
  ),
  /** Only relevant for wholeFileMode: 'overwrite'. If true, allows overwriting. If false (default) and file exists, operation fails. */
  overwriteIfExists: z.boolean().optional().default(false).describe(
    "Only relevant for wholeFileMode: 'overwrite'. If true, allows overwriting an existing file. If false (default) and the file exists when mode is 'overwrite', the operation will fail."
  ),
});

// Schema for 'patch' modification type
const PatchUpdateSchema = BaseUpdateSchema.extend({
  modificationType: z.literal(ModificationTypeSchema.enum.patch),
  /** The type of patch operation relative to the target. */
  patchOperation: PatchOperationSchema.describe('The type of patch operation relative to the target.'),
  /** The type of internal structure to target. */
  patchTargetType: PatchTargetTypeSchema.describe('The type of internal structure to target.'),
  /** The specific heading text, block ID, or frontmatter key to target. */
  patchTarget: z.string().min(1, "patchTarget cannot be empty").describe(
    'The specific heading text, block ID, or frontmatter key to target.'
  ),
  /** Delimiter for nested headings (default '::'). */
  patchTargetDelimiter: z.string().optional().describe("Delimiter for nested headings (default '::')."),
  /** Whether to trim whitespace around the patch target. */
  patchTrimTargetWhitespace: z.boolean().optional().default(false).describe(
    'Whether to trim whitespace around the patch target.'
  ),
  /** Whether to create the target (e.g., heading, frontmatter key) if it's missing before patching. */
  patchCreateTargetIfMissing: z.boolean().optional().default(false).describe(
    "Whether to create the target (e.g., heading, frontmatter key) if it's missing before patching."
  ), // <-- Added comma here
});

// --- Schema for Registration (Flattened Object) ---
// Combine all fields, making mode-specific ones optional for registration shape.
// The SDK uses this shape for basic validation. More specific validation (e.g., required fields based on mode) happens in the refined schema.
const ObsidianUpdateFileRegistrationSchema = z.object({
  /** Specifies the target note: 'filePath' (requires targetIdentifier), 'activeFile' (currently open file), or 'periodicNote' (requires targetIdentifier with period like 'daily'). */
  targetType: TargetTypeSchema.describe("Specifies the target note: 'filePath' (requires targetIdentifier), 'activeFile' (currently open file), or 'periodicNote' (requires targetIdentifier with period like 'daily')."),
  /** The content for the modification. Must be a string for 'wholeFile' mode or 'patch' targeting 'heading'/'block'. Must be a JSON object for 'patch' targeting 'frontmatter'. */
  content: z.union([z.string(), z.record(z.any())]).describe(
    "The content for the modification. Must be a string for 'wholeFile' mode or 'patch' targeting 'heading'/'block'. Must be a JSON object for 'patch' targeting 'frontmatter'."
  ),
  /** Identifier for the target when targetType is 'filePath' (vault-relative path, e.g., 'Notes/My File.md') or 'periodicNote' (period string: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'). Not used for 'activeFile'. */
  targetIdentifier: z.string().optional().describe(
    "Identifier for the target when targetType is 'filePath' (vault-relative path, e.g., 'Notes/My File.md') or 'periodicNote' (period string: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'). Not used for 'activeFile'."
  ),
  /** Determines the modification strategy: 'wholeFile' (append, prepend, overwrite entire file) or 'patch' (modify relative to heading, block, or frontmatter). */
  modificationType: ModificationTypeSchema.describe("Determines the modification strategy: 'wholeFile' (append, prepend, overwrite entire file) or 'patch' (modify relative to heading, block, or frontmatter)."),

  // --- WholeFile Mode Parameters (Required if modificationType is 'wholeFile') ---
  /** For 'wholeFile' mode: 'append' (add to end), 'prepend' (add to start), or 'overwrite' (replace entire content). */
  wholeFileMode: WholeFileModeSchema.optional().describe("For 'wholeFile' mode: 'append' (add to end), 'prepend' (add to start), or 'overwrite' (replace entire content). Required if modificationType is 'wholeFile'."),
  /** For 'wholeFile' mode: If true (default), creates the target file/note if it doesn't exist before modifying. If false, fails if the target doesn't exist. */
  createIfNeeded: z.boolean().optional().default(true).describe(
    "For 'wholeFile' mode: If true (default), creates the target file/note if it doesn't exist before modifying. If false, fails if the target doesn't exist."
  ),
  /** For 'wholeFile' mode with 'overwrite': If false (default), the operation fails if the target file already exists. If true, allows overwriting the existing file. */
  overwriteIfExists: z.boolean().optional().default(false).describe(
    "For 'wholeFile' mode with 'overwrite': If false (default), the operation fails if the target file already exists. If true, allows overwriting the existing file."
  ),

  // --- Patch Mode Parameters (Required if modificationType is 'patch') ---
  /** For 'patch' mode: 'append' (after target), 'prepend' (before target), or 'replace' (the target itself). */
  patchOperation: PatchOperationSchema.optional().describe("For 'patch' mode: 'append' (after target), 'prepend' (before target), or 'replace' (the target itself). Required if modificationType is 'patch'."),
  /** For 'patch' mode: The type of internal structure to target: 'heading', 'block' (paragraph/list item ID), or 'frontmatter' (YAML key). */
  patchTargetType: PatchTargetTypeSchema.optional().describe("For 'patch' mode: The type of internal structure to target: 'heading' (attempts case-insensitive fallback), 'block' (paragraph/list item ID), or 'frontmatter' (YAML key). Required if modificationType is 'patch'."),
  /** For 'patch' mode: The specific target identifier (e.g., heading text like '## Section Title', block ID like '^abcd', or frontmatter key like 'status'). For headings, attempts case-insensitive fallback if exact match fails. */
  patchTarget: z.string().optional().describe(
    "For 'patch' mode: The specific target identifier (e.g., heading text like '## Section Title', block ID like '^abcd', or frontmatter key like 'status'). For headings, attempts case-insensitive fallback if exact match fails. Required if modificationType is 'patch'."
  ),
  /** For 'patch' mode targeting nested headings: The delimiter used (default '::', e.g., 'Heading 1::Subheading'). Case-insensitive fallback applies to the full delimited heading string. */
  patchTargetDelimiter: z.string().optional().describe("For 'patch' mode targeting nested headings: The delimiter used (default '::', e.g., 'Heading 1::Subheading'). Case-insensitive fallback applies to the full delimited heading string."),
  /** For 'patch' mode: Whether to trim leading/trailing whitespace from the identified target before applying the operation (default false). */
  patchTrimTargetWhitespace: z.boolean().optional().default(false).describe(
    "For 'patch' mode: Whether to trim leading/trailing whitespace from the identified target before applying the operation (default false)."
  ),
  /** For 'patch' mode: If true, creates the target heading or frontmatter key if it doesn't exist before patching (default false). Does not apply to 'block' targets. */
  patchCreateTargetIfMissing: z.boolean().optional().default(false).describe(
    "For 'patch' mode: If true, creates the target heading or frontmatter key if it doesn't exist before patching (default false). Does not apply to 'block' targets."
  ),
}).describe( // Add overall description for the registration schema object
    "Input parameters for modifying Obsidian notes. Supports both whole-file operations (append, prepend, overwrite) and granular patches relative to headings, blocks, or frontmatter keys. Specify target via file path, active file, or periodic note identifier."
);

// Export the shape of the flattened registration schema
export const ObsidianUpdateFileInputSchemaShape = ObsidianUpdateFileRegistrationSchema.shape;
// Also export the inferred type from the registration schema for the handler signature
export type ObsidianUpdateFileRegistrationInput = z.infer<typeof ObsidianUpdateFileRegistrationSchema>;


// --- Schema for Logic/Type Inference (Discriminated Union with Refinements) ---
// Use the original discriminated union for accurate typing and refinement logic.
export const ObsidianUpdateFileInputSchema = z.discriminatedUnion("modificationType", [
  WholeFileUpdateSchema,
  PatchUpdateSchema
]).refine(data => {
    // Validate targetIdentifier based on targetType
    if ((data.targetType === 'filePath' || data.targetType === 'periodicNote') && !data.targetIdentifier) {
      return false; // Missing targetIdentifier for filePath or periodicNote
    }
    if (data.targetType === 'periodicNote' && data.targetIdentifier && !PeriodicNotePeriodSchema.safeParse(data.targetIdentifier).success) {
        return false; // Invalid period for periodicNote
    }
    return true;
  }, {
    message: "targetIdentifier is required and must be a valid path for targetType 'filePath', or a valid period ('daily', 'weekly', etc.) for targetType 'periodicNote'.",
    path: ["targetIdentifier"], // Point error to targetIdentifier
  }).refine(data => {
    // Validate content type for patch operations
    if (data.modificationType === 'patch' && data.patchTargetType === 'frontmatter' && typeof data.content !== 'object') {
        return false; // Frontmatter patch requires object content
    }
    if (data.modificationType === 'patch' && data.patchTargetType !== 'frontmatter' && typeof data.content !== 'string') {
        return false; // Heading/block patch requires string content
    }
    // Validate content type for whole file operations
    if (data.modificationType === 'wholeFile' && typeof data.content !== 'string') {
        return false; // Whole file operations require string content
    }
    return true;
  }, {
    message: "Invalid content type. 'patch' with 'frontmatter' requires object content. Other 'patch' types and 'wholeFile' require string content.",
    path: ["content"],
    // Removed duplicate path property here
});

// Type derived from the *refined* discriminated union schema
export type ObsidianUpdateFileInput = z.infer<typeof ObsidianUpdateFileInputSchema>;

// Response is just confirmation
export interface ObsidianUpdateFileResponse {
  success: boolean;
  message: string;
}


// --- Helper Functions ---

/**
 * Finds a heading in markdown content using case-insensitive matching.
 * Handles simple headings and nested headings with a delimiter.
 * Returns the correctly cased heading if a unique match is found, otherwise null.
 */
function findCaseInsensitiveHeading(
    markdownContent: string,
    targetHeading: string,
    delimiter: string = '::' // Default delimiter used by Obsidian API
): string | null {
    const targetHeadingLower = targetHeading.toLowerCase();
    const headingRegex = /^#+\s+(.*)/gm; // Matches lines starting with #
    let match;
    const foundHeadings: string[] = [];

    while ((match = headingRegex.exec(markdownContent)) !== null) {
        const actualHeading = match[1].trim(); // Get the heading text
        // Simple comparison for non-nested headings or if delimiter isn't present
        if (!targetHeading.includes(delimiter)) {
             if (actualHeading.toLowerCase() === targetHeadingLower) {
                foundHeadings.push(actualHeading);
            }
        } else {
            // Handle nested headings - compare the full string case-insensitively
            // This assumes the API handles nested targets correctly if we provide the full string
             if (actualHeading.toLowerCase() === targetHeadingLower) {
                 foundHeadings.push(actualHeading);
             }
             // Note: A more robust nested heading check might involve parsing the structure,
             // but for fallback, matching the full string might suffice if the API supports it.
        }
    }

    if (foundHeadings.length === 1) {
        return foundHeadings[0]; // Return the uniquely found, correctly cased heading
    }
    return null; // No unique match found
}


// --- Core Logic Function ---

/**
 * Processes the core logic for updating a file/note in the Obsidian vault.
 * Includes case-insensitive fallback for heading patches.
 */
export const processObsidianUpdateFile = async (
  params: ObsidianUpdateFileInput, // Use the refined type here for logic
  context: RequestContext,
  obsidianService: ObsidianRestApiService
): Promise<ObsidianUpdateFileResponse> => {
  logger.debug(`Processing obsidian_update_file request`, { ...context, targetType: params.targetType, modificationType: params.modificationType });

  const targetId = params.targetIdentifier; // Alias for clarity

  try {
    // --- Patch Logic ---
    if (params.modificationType === 'patch') {
      let patchOptions: PatchOptions = {
        operation: params.patchOperation,
        targetType: params.patchTargetType,
        target: params.patchTarget, // Initial target
        targetDelimiter: params.patchTargetDelimiter,
        trimTargetWhitespace: params.patchTrimTargetWhitespace,
        createTargetIfMissing: params.patchCreateTargetIfMissing,
        // Determine content type for header
        contentType: typeof params.content === 'object' ? 'application/json' : 'text/markdown',
      };
      const originalTarget = params.patchTarget; // Keep original for error messages

      try {
        // Initial patch attempt
        logger.debug(`Attempting patch (case-sensitive target: ${originalTarget})`, { ...context, targetType: params.targetType, targetId: targetId ?? 'active' });
        switch (params.targetType) {
          case 'filePath':
            if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "filePath targetIdentifier is missing for patch.", context);
            await obsidianService.patchFile(targetId, params.content, patchOptions, context);
            break;
          case 'activeFile':
            await obsidianService.patchActiveFile(params.content, patchOptions, context);
            break;
          case 'periodicNote':
            if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "periodicNote targetIdentifier is missing for patch.", context);
            const period = PeriodicNotePeriodSchema.parse(targetId);
            await obsidianService.patchPeriodicNote(period, params.content, patchOptions, context);
            break;
        }
        logger.debug(`Successfully patched target (case-sensitive): ${params.targetType} ${targetId ?? '(active)'}`, context);

      } catch (error) {
        // Check if it's a heading patch failure potentially due to case sensitivity
        const isHeadingPatch = params.patchTargetType === 'heading';
        // Assuming 400 Bad Request with specific message indicates target not found
        const isLikelyHeadingNotFound = error instanceof McpError &&
                                        error.code === BaseErrorCode.VALIDATION_ERROR && // 400 Bad Request
                                        typeof error.message === 'string' &&
                                        (error.message.includes("Could not find target heading") || error.message.includes("Target heading not found")); // Check message

        if (isHeadingPatch && isLikelyHeadingNotFound) {
            logger.info(`Heading patch failed for "${originalTarget}". Attempting case-insensitive fallback.`, context);

            let fileContent: string | null = null;
            let targetDescription = ''; // For logging/errors

            // Get file content for fallback check
            try {
                switch (params.targetType) {
                    case 'filePath':
                        if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "filePath targetIdentifier missing for heading fallback.", context);
                        targetDescription = targetId;
                        fileContent = await obsidianService.getFileContent(targetId, 'markdown', context) as string;
                        break;
                    case 'activeFile':
                        targetDescription = 'active file';
                        fileContent = await obsidianService.getActiveFile('markdown', context) as string;
                        break;
                    case 'periodicNote':
                         if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "periodicNote targetIdentifier missing for heading fallback.", context);
                         targetDescription = `periodic note ${targetId}`;
                         const period = PeriodicNotePeriodSchema.parse(targetId);
                         fileContent = await obsidianService.getPeriodicNote(period, 'markdown', context) as string;
                         break;
                }
            } catch (readError) {
                 logger.error(`Failed to read content for heading fallback in ${targetDescription}`, readError instanceof Error ? readError : undefined, context);
                 // Re-throw the original patch error if we can't even read the file
                 throw error;
            }

            if (fileContent === null) {
                 logger.error(`Could not retrieve content for heading fallback in ${targetDescription}`, context);
                 throw error; // Re-throw original patch error
            }

            // Find the correctly cased heading
            const correctHeading = findCaseInsensitiveHeading(fileContent, originalTarget, params.patchTargetDelimiter);

            if (correctHeading) {
                logger.info(`Found case-insensitive heading match: "${correctHeading}". Retrying patch.`, context);
                // Retry patch with the correct heading
                patchOptions = { ...patchOptions, target: correctHeading }; // Update options
                try {
                     switch (params.targetType) {
                        case 'filePath':
                            await obsidianService.patchFile(targetId!, params.content, patchOptions, context);
                            break;
                        case 'activeFile':
                            await obsidianService.patchActiveFile(params.content, patchOptions, context);
                            break;
                        case 'periodicNote':
                            const period = PeriodicNotePeriodSchema.parse(targetId!);
                            await obsidianService.patchPeriodicNote(period, params.content, patchOptions, context);
                            break;
                    }
                    logger.debug(`Successfully patched target (case-insensitive fallback): ${params.targetType} ${targetId ?? '(active)'}`, context);
                    // If successful, exit the outer try/catch block normally
                } catch (retryError) {
                     logger.error(`Patch retry failed even with case-insensitive heading "${correctHeading}"`, retryError instanceof Error ? retryError : undefined, context);
                     // Throw the *retry* error as it's more relevant now
                     throw retryError;
                }
            } else {
                 logger.error(`Case-insensitive fallback failed: No unique heading match found for "${originalTarget}" in ${targetDescription}.`, context);
                 // Re-throw the original "heading not found" error
                 throw error;
            }

        } else {
            // Not a heading patch error we can handle with fallback, re-throw
            throw error;
        }
      } // End of inner try/catch for patch attempt

    // --- Whole File Logic ---
    } else if (params.modificationType === 'wholeFile') {
      if (typeof params.content !== 'string') {
          throw new McpError(BaseErrorCode.VALIDATION_ERROR, "Whole file operations require string content.", context);
      }
      const contentString = params.content;

      // TODO: Handle 'createIfNeeded' and 'overwriteIfExists' logic more explicitly if API doesn't fully cover it.
      // The current API methods often create if missing. Overwrite needs careful handling.
      // Prepend requires read -> modify -> write sequence.

      if (params.wholeFileMode === 'prepend') {
          // Manual prepend implementation (Read -> Prepend -> Write)
          let existingContent = '';
          try {
              // Attempt to read existing content
              if (params.targetType === 'filePath' && targetId) {
                  existingContent = await obsidianService.getFileContent(targetId, 'markdown', context) as string;
              } else if (params.targetType === 'activeFile') {
                  existingContent = await obsidianService.getActiveFile('markdown', context) as string;
              } else if (params.targetType === 'periodicNote' && targetId) {
                  const period = PeriodicNotePeriodSchema.parse(targetId);
                  existingContent = await obsidianService.getPeriodicNote(period, 'markdown', context) as string;
              }
          } catch (error) {
              if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
                  if (!params.createIfNeeded) {
                      throw new McpError(BaseErrorCode.NOT_FOUND, `Target not found and createIfNeeded is false for prepend.`, context);
                  }
                  // File doesn't exist, treat prepend as overwrite/create
                  existingContent = '';
              } else {
                  throw error; // Re-throw other read errors
              }
          }
          const newContent = contentString + existingContent;
          // Now overwrite with the prepended content
          if (params.targetType === 'filePath' && targetId) {
              await obsidianService.updateFileContent(targetId, newContent, context);
          } else if (params.targetType === 'activeFile') {
              await obsidianService.updateActiveFile(newContent, context);
          } else if (params.targetType === 'periodicNote' && targetId) {
              const period = PeriodicNotePeriodSchema.parse(targetId);
              await obsidianService.updatePeriodicNote(period, newContent, context);
          }
          logger.debug(`Successfully prepended to target: ${params.targetType} ${targetId ?? '(active)'}`, context);

      } else { // Append or Overwrite
          const mode = params.wholeFileMode; // append or overwrite

          // Check overwrite condition
          if (mode === 'overwrite' && !params.overwriteIfExists) {
              // Need to check if file exists BEFORE attempting overwrite
              let exists = false;
              try {
                  if (params.targetType === 'filePath' && targetId) {
                      await obsidianService.getFileContent(targetId, 'markdown', context); // Check existence
                      exists = true;
                  } else if (params.targetType === 'activeFile') {
                      await obsidianService.getActiveFile('markdown', context); // Active file always exists if API responds
                      exists = true;
                  } else if (params.targetType === 'periodicNote' && targetId) {
                      const period = PeriodicNotePeriodSchema.parse(targetId);
                      await obsidianService.getPeriodicNote(period, 'markdown', context); // Check existence
                      exists = true;
                  }
              } catch (error) {
                  if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
                      exists = false; // Doesn't exist, overwrite is safe (acts like create)
                  } else {
                      throw error; // Re-throw other errors during check
                  }
              }
              if (exists) {
                  throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Target exists and overwriteIfExists is false for overwrite operation.`, context);
              }
          }

          // Call appropriate API method
          switch (params.targetType) {
            case 'filePath':
              if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "filePath targetIdentifier is missing.", context);
              if (mode === 'append') await obsidianService.appendFileContent(targetId, contentString, context);
              else await obsidianService.updateFileContent(targetId, contentString, context); // Overwrite
              break;
            case 'activeFile':
              if (mode === 'append') await obsidianService.appendActiveFile(contentString, context);
              else await obsidianService.updateActiveFile(contentString, context); // Overwrite
              break;
            case 'periodicNote':
              if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "periodicNote targetIdentifier is missing.", context);
              const period = PeriodicNotePeriodSchema.parse(targetId);
              if (mode === 'append') await obsidianService.appendPeriodicNote(period, contentString, context);
              else await obsidianService.updatePeriodicNote(period, contentString, context); // Overwrite
              break;
          }
          logger.debug(`Successfully performed ${mode} on target: ${params.targetType} ${targetId ?? '(active)'}`, context);
      }
    }

    return { success: true, message: "Update operation successful." };

  } catch (error) {
    // Errors from obsidianService are already McpErrors and logged
    if (error instanceof McpError) {
      throw error;
    } else {
      const errorMessage = `Unexpected error updating Obsidian file/note`;
      logger.error(errorMessage, error instanceof Error ? error : undefined, context);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, errorMessage, context);
    }
  }
};
