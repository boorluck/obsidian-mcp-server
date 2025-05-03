import { format } from 'date-fns';
import { BaseErrorCode, McpError } from '../../types-global/errors.js';
import { logger, RequestContext } from '../internal/index.js';
import { countTokens } from '../metrics/index.js'; // Import token counter

/**
 * Default format string for timestamps.
 * Example: 08:40:00 PM | 05-02-2025
 */
const DEFAULT_TIMESTAMP_FORMAT = 'hh:mm:ss a | MM-dd-yyyy';

/**
 * Formats a Unix timestamp (milliseconds since epoch) into a human-readable string.
 *
 * @param timestampMs - The Unix timestamp in milliseconds.
 * @param context - The request context for logging.
 * @param formatString - Optional format string (uses date-fns tokens). Defaults to 'MM-dd-yyyy, h:mm a'.
 * @returns The formatted timestamp string.
 * @throws McpError if the timestamp is invalid.
 */
export function formatTimestamp(
  timestampMs: number | undefined | null,
  context: RequestContext,
  formatString: string = DEFAULT_TIMESTAMP_FORMAT,
): string {
  if (timestampMs === undefined || timestampMs === null || !Number.isFinite(timestampMs)) {
    logger.warning(`Invalid timestamp received for formatting: ${timestampMs}`, context);
    // Return a placeholder or throw, depending on desired strictness. Let's return a placeholder for now.
    // throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid timestamp provided: ${timestampMs}`, context);
    return 'Invalid Date';
  }

  try {
    const date = new Date(timestampMs);
    // Check if the date is valid after creation
    if (isNaN(date.getTime())) {
      logger.warning(`Timestamp resulted in an invalid date: ${timestampMs}`, context);
      return 'Invalid Date';
    }
    return format(date, formatString);
  } catch (error) {
    // Ensure we pass an Error object or structured data to the logger
    const errorToLog = error instanceof Error ? error : { message: String(error) };
    logger.error('Error formatting timestamp', errorToLog, context);
    // Throw a specific error or return a placeholder
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to format timestamp ${timestampMs}: ${error instanceof Error ? error.message : String(error)}`,
      context,
    );
    // return 'Formatting Error';
  }
}

/**
 * Formats the ctime and mtime within an Obsidian API Stat object.
 * Returns a new object with formatted timestamps, leaving the original numbers intact.
 *
 * @param stat - The Stat object from the Obsidian API.
 * @param context - The request context for logging.
 * @returns A new object containing formatted createdTime and modifiedTime strings.
 */
export function formatStatTimestamps(
  stat: { ctime: number; mtime: number; size: number } | undefined | null,
  context: RequestContext,
): { createdTime: string; modifiedTime: string } { // Renamed fields
  if (!stat) {
    return {
      createdTime: 'N/A', // Renamed field
      modifiedTime: 'N/A', // Renamed field
    };
  }
  return {
    createdTime: formatTimestamp(stat.ctime, context), // Renamed field
    modifiedTime: formatTimestamp(stat.mtime, context), // Renamed field
  };
}

/**
 * Creates a formatted stat object including formatted timestamps and an estimated token count.
 *
 * @param stat - The original Stat object from the Obsidian API.
 * @param content - The file content string to calculate token count from.
 * @param context - The request context for logging.
 * @returns An object containing createdTime, modifiedTime, and tokenCountEstimate, or null/undefined if input stat is null/undefined.
 */
export async function createFormattedStatWithTokenCount( // Renamed function, made async
    stat: { ctime: number; mtime: number; size: number } | null | undefined,
    content: string, // Added content parameter
    context: RequestContext
): Promise<{ createdTime: string; modifiedTime: string; tokenCountEstimate: number } | null | undefined> { // Updated return type
    if (!stat) {
        return stat; // Return original null/undefined
    }

    const formattedTimestamps = formatStatTimestamps(stat, context);
    let tokenCountEstimate = -1; // Default value if counting fails or content is empty

    if (content && content.trim().length > 0) {
        try {
            tokenCountEstimate = await countTokens(content, context);
        } catch (tokenError) {
            logger.warning(`Failed to count tokens for stat object creation. Error: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`, context);
            // Keep tokenCountEstimate as -1 or another indicator
        }
    } else {
         logger.debug('Content is empty, setting tokenCountEstimate to 0.', context);
         tokenCountEstimate = 0;
    }


    // Create a new object with formatted timestamps and token count
    return {
        createdTime: formattedTimestamps.createdTime, // Use renamed field
        modifiedTime: formattedTimestamps.modifiedTime, // Use renamed field
        tokenCountEstimate: tokenCountEstimate // Use token count instead of size
    };
}
