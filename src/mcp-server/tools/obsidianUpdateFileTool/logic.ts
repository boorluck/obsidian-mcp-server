import { z } from 'zod';
import { NoteJson, ObsidianRestApiService, NoteStat } from '../../../services/obsidianRestAPI/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext, createFormattedStatWithTokenCount } from '../../../utils/index.js'; // Use new utility name

// --- Schema Definitions ---

const TargetTypeSchema = z.enum(['filePath', 'activeFile', 'periodicNote']);
const ModificationTypeSchema = z.literal('wholeFile'); // Only allow wholeFile
const WholeFileModeSchema = z.enum(['append', 'prepend', 'overwrite']);
const PeriodicNotePeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

// Base schema containing common fields
const BaseUpdateSchema = z.object({
  /** Specifies the type of target note. */
  targetType: TargetTypeSchema.describe('Specifies the type of target note.'),
  /** The content to use for the modification. Must be a string for whole-file operations. */
  content: z.string().describe(
    'The content to use for the modification. Must be a string for whole-file operations.'
  ),
  /** Required if targetType is 'filePath' (provide vault-relative path) or 'periodicNote' (provide period like 'daily'). Not used for 'activeFile'. */
  targetIdentifier: z.string().optional().describe(
    "Required if targetType is 'filePath' (provide vault-relative path) or 'periodicNote' (provide period like 'daily', 'weekly'). Not used for 'activeFile'."
  ),
});

// Schema for 'wholeFile' modification type
const WholeFileUpdateSchema = BaseUpdateSchema.extend({
  modificationType: ModificationTypeSchema,
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
  /** If true, returns the final content of the file in the response. */
  returnContent: z.boolean().optional().default(false).describe(
    "If true, returns the final content of the file in the response."
  ),
});

// --- Schema for Registration (Flattened Object) ---
// Combine all fields, making mode-specific ones optional for registration shape.
const ObsidianUpdateFileRegistrationSchema = z.object({
  /** Specifies the target note: 'filePath' (requires targetIdentifier), 'activeFile' (currently open file), or 'periodicNote' (requires targetIdentifier with period like 'daily'). */
  targetType: TargetTypeSchema.describe("Specifies the target note: 'filePath' (requires targetIdentifier), 'activeFile' (currently open file), or 'periodicNote' (requires targetIdentifier with period like 'daily')."),
  /** The content for the modification. Must be a string for whole-file operations. */
  content: z.string().describe(
    "The content for the modification. Must be a string for whole-file operations."
  ),
  /** Identifier for the target when targetType is 'filePath' (vault-relative path, e.g., 'Notes/My File.md') or 'periodicNote' (period string: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'). Not used for 'activeFile'. */
  targetIdentifier: z.string().optional().describe(
    "Identifier for the target when targetType is 'filePath' (vault-relative path, e.g., 'Notes/My File.md') or 'periodicNote' (period string: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'). Not used for 'activeFile'."
  ),
  /** Determines the modification strategy: 'wholeFile' (append, prepend, overwrite entire file). */
  modificationType: ModificationTypeSchema.describe("Determines the modification strategy: 'wholeFile' (append, prepend, overwrite entire file)."),

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
  /** If true, returns the final content of the file in the response. Defaults to false. */
  returnContent: z.boolean().optional().default(false).describe(
    "If true, returns the final content of the file in the response. Defaults to false."
  ),

}).describe(
    "Tool to modify Obsidian notes (specified by file path, the active file, or a periodic note) using whole-file operations: 'append', 'prepend', or 'overwrite'. Options allow creating missing files/targets and controlling overwrite behavior."
);

// Export the shape of the flattened registration schema
export const ObsidianUpdateFileInputSchemaShape = ObsidianUpdateFileRegistrationSchema.shape;
// Also export the inferred type from the registration schema for the handler signature
export type ObsidianUpdateFileRegistrationInput = z.infer<typeof ObsidianUpdateFileRegistrationSchema>;


// --- Schema for Logic/Type Inference (Refined Schema) ---
// Use the refined schema for accurate typing and refinement logic.
export const ObsidianUpdateFileInputSchema = WholeFileUpdateSchema.refine(data => {
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
  });

// Type derived from the *refined* schema
export type ObsidianUpdateFileInput = z.infer<typeof ObsidianUpdateFileInputSchema>;

// --- Response Type ---
// Define the *new* Stat type containing formatted timestamps and token count
type FormattedStat = { createdTime: string; modifiedTime: string; tokenCountEstimate: number }; // Updated fields

export interface ObsidianUpdateFileResponse {
  success: boolean;
  message: string;
  // timestamp: string; // REMOVED - Now part of stat
  stat?: FormattedStat; // Use the updated formatted stat type
  finalContent?: string; // Added optional final content
}


// --- Helper Function to Get Final State ---
async function getFinalState(
    targetType: z.infer<typeof TargetTypeSchema>,
    targetIdentifier: string | undefined,
    period: z.infer<typeof PeriodicNotePeriodSchema> | undefined,
    obsidianService: ObsidianRestApiService,
    context: RequestContext
): Promise<NoteJson | null> {
    try {
        let noteJson: NoteJson | null = null;
        if (targetType === 'filePath' && targetIdentifier) {
            noteJson = await obsidianService.getFileContent(targetIdentifier, 'json', context) as NoteJson;
        } else if (targetType === 'activeFile') {
            noteJson = await obsidianService.getActiveFile('json', context) as NoteJson;
        } else if (targetType === 'periodicNote' && period) {
            noteJson = await obsidianService.getPeriodicNote(period, 'json', context) as NoteJson;
        }
        return noteJson;
    } catch (error) {
        // Log error but don't fail the whole operation if reading final state fails
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warning(`Could not retrieve final state after update. Error: ${errorMsg}`, context);
        return null;
    }
}

// --- Helper Function to Format Timestamp ---
// REMOVED - Now using shared utility 'addFormattedTimestampsToStat' from utils


// --- Core Logic Function ---

/**
 * Processes the core logic for updating a file/note in the Obsidian vault
 * using whole-file operations (append, prepend, overwrite).
 */
export const processObsidianUpdateFile = async (
  params: ObsidianUpdateFileInput, // Use the refined type here for logic
  context: RequestContext,
  obsidianService: ObsidianRestApiService
): Promise<ObsidianUpdateFileResponse> => {
  logger.debug(`Processing obsidian_update_file request (wholeFile mode)`, { ...context, targetType: params.targetType, wholeFileMode: params.wholeFileMode });

  const targetId = params.targetIdentifier; // Alias for clarity
  const contentString = params.content;
  const mode = params.wholeFileMode;
  let wasCreated = false; // Flag to track if the file was newly created
  let targetPeriod: z.infer<typeof PeriodicNotePeriodSchema> | undefined;

  if (params.targetType === 'periodicNote' && targetId) {
      targetPeriod = PeriodicNotePeriodSchema.parse(targetId);
  }

  try {
    // --- Pre-operation checks (Existence for overwrite/prepend/append with createIfNeeded) ---
    let existsBefore = false;
    try {
        if (params.targetType === 'filePath' && targetId) {
            await obsidianService.getFileContent(targetId, 'json', context); // Check existence
            existsBefore = true;
        } else if (params.targetType === 'activeFile') {
            await obsidianService.getActiveFile('json', context); // Active file always exists if API responds
            existsBefore = true;
        } else if (params.targetType === 'periodicNote' && targetPeriod) {
            await obsidianService.getPeriodicNote(targetPeriod, 'json', context); // Check existence
            existsBefore = true;
        }
    } catch (error) {
        if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
            existsBefore = false; // Doesn't exist
        } else {
            throw error; // Re-throw other errors during check
        }
    }

    // --- Overwrite safety check ---
    if (mode === 'overwrite' && existsBefore && !params.overwriteIfExists) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Target exists and overwriteIfExists is false for overwrite operation.`, context);
    }

    // --- Not Found check when createIfNeeded is false ---
    if (!existsBefore && !params.createIfNeeded) {
         throw new McpError(BaseErrorCode.NOT_FOUND, `Target not found and createIfNeeded is false.`, context);
    }

    // Determine if creation will happen
    wasCreated = !existsBefore && params.createIfNeeded;

    // --- Perform the Update Operation ---
    if (mode === 'prepend') {
        // Manual prepend implementation (Read -> Prepend -> Write)
        let existingContent = '';
        if (existsBefore) { // Only read if it existed before
            try {
                if (params.targetType === 'filePath' && targetId) {
                    existingContent = await obsidianService.getFileContent(targetId, 'markdown', context) as string;
                } else if (params.targetType === 'activeFile') {
                    existingContent = await obsidianService.getActiveFile('markdown', context) as string;
                } else if (params.targetType === 'periodicNote' && targetPeriod) {
                    existingContent = await obsidianService.getPeriodicNote(targetPeriod, 'markdown', context) as string;
                }
            } catch (readError) {
                 // Should not happen if existsBefore is true, but handle defensively
                 const errorMsg = readError instanceof Error ? readError.message : String(readError);
                 logger.warning(`Error reading existing content for prepend despite existence check. Error: ${errorMsg}`, context);
                 throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to read existing content for prepend.`, context);
            }
        }
        // If it didn't exist before, existingContent remains '', effectively making prepend act like create/overwrite

        const newContent = contentString + existingContent;
        // Now overwrite with the prepended content
        if (params.targetType === 'filePath' && targetId) {
            await obsidianService.updateFileContent(targetId, newContent, context);
        } else if (params.targetType === 'activeFile') {
            await obsidianService.updateActiveFile(newContent, context);
        } else if (params.targetType === 'periodicNote' && targetPeriod) {
            await obsidianService.updatePeriodicNote(targetPeriod, newContent, context);
        }
        logger.debug(`Successfully prepended to target: ${params.targetType} ${targetId ?? '(active)'}`, context);

    } else if (mode === 'append') {
        // Manual append implementation (Read -> Append -> Write)
        let existingContent = '';
        if (existsBefore) { // Only read if it existed before
            try {
                if (params.targetType === 'filePath' && targetId) {
                    existingContent = await obsidianService.getFileContent(targetId, 'markdown', context) as string;
                } else if (params.targetType === 'activeFile') {
                    existingContent = await obsidianService.getActiveFile('markdown', context) as string;
                } else if (params.targetType === 'periodicNote' && targetPeriod) {
                    existingContent = await obsidianService.getPeriodicNote(targetPeriod, 'markdown', context) as string;
                }
            } catch (readError) {
                 const errorMsg = readError instanceof Error ? readError.message : String(readError);
                 logger.warning(`Error reading existing content for append despite existence check. Error: ${errorMsg}`, context);
                 throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to read existing content for append.`, context);
            }
        }
        // If it didn't exist before, existingContent remains '', effectively making append act like create/overwrite

        const newContent = existingContent + contentString; // Combine without adding extra newline
        // Now overwrite with the appended content
        if (params.targetType === 'filePath' && targetId) {
            await obsidianService.updateFileContent(targetId, newContent, context);
        } else if (params.targetType === 'activeFile') {
            await obsidianService.updateActiveFile(newContent, context);
        } else if (params.targetType === 'periodicNote' && targetPeriod) {
            await obsidianService.updatePeriodicNote(targetPeriod, newContent, context);
        }
        logger.debug(`Successfully appended (manually) to target: ${params.targetType} ${targetId ?? '(active)'}`, context);

    } else { // Overwrite (only remaining option)
        // Call appropriate API method for overwrite
        switch (params.targetType) {
          case 'filePath':
            if (!targetId) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "filePath targetIdentifier is missing.", context);
            await obsidianService.updateFileContent(targetId, contentString, context);
            break;
          case 'activeFile':
            await obsidianService.updateActiveFile(contentString, context);
            break;
          case 'periodicNote':
            if (!targetPeriod) throw new McpError(BaseErrorCode.VALIDATION_ERROR, "periodicNote targetIdentifier is missing or invalid.", context);
            await obsidianService.updatePeriodicNote(targetPeriod, contentString, context);
            break;
        }
        logger.debug(`Successfully performed overwrite on target: ${params.targetType} ${targetId ?? '(active)'}`, context);
    }

    // --- Get Final State (Stat and Optional Content) ---
    const finalState = await getFinalState(params.targetType, targetId, targetPeriod, obsidianService, context);
    // const timestamp = formatTimestamp(new Date()); // REMOVED - Formatting handled by addFormattedTimestampsToStat

    // --- Construct Success Message ---
    let messageAction: string = mode; // Declare as string
    if (wasCreated) {
        messageAction = mode === 'overwrite' ? 'created' : `${mode} (created)`; // Use past tense consistently or just state action
    } else {
        messageAction = mode; // Use present tense for existing files
    }
    const targetName = params.targetType === 'filePath' ? `'${targetId}'`
                     : params.targetType === 'periodicNote' ? `'${targetId}' note`
                     : 'active file';
    // Construct message based on action and creation status
    const successMessage = wasCreated
        ? `File ${targetName} successfully created via ${mode} operation.`
        : `File content successfully ${mode === 'overwrite' ? 'overwritten' : mode + 'ed'} for ${targetName}.`;


    // --- Build Response ---
    // Create the formatted stat object using the new utility, passing content, ensuring it's undefined if null is returned
    const finalContentForStat = finalState?.content ?? ''; // Get content for token counting
    const formattedStatResult = finalState?.stat
        ? await createFormattedStatWithTokenCount(finalState.stat, finalContentForStat, context) // Pass content, await result
        : undefined;
    const formattedStat = formattedStatResult === null ? undefined : formattedStatResult; // Convert null to undefined

    const response: ObsidianUpdateFileResponse = {
        success: true,
        message: successMessage,
        // timestamp: timestamp, // REMOVED
        stat: formattedStat, // Use the new formatted stat object
    };

    if (params.returnContent) {
        response.finalContent = finalState?.content;
    }

    return response;

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
