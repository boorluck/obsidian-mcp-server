import path from 'node:path';
import { z } from 'zod';
import { NoteJson, NoteStat, ObsidianRestApiService, SimpleSearchResult } from '../../../services/obsidianRestAPI/index.js';
import { VaultCacheService } from '../../../services/vaultCache/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { dateParser, logger, RequestContext, sanitizeInputForLogging } from '../../../utils/index.js';

// ====================================================================================
// Schema Definitions (Unchanged)
// ====================================================================================
const ObsidianGlobalSearchInputSchema = z.object({
  query: z.string().min(1).describe("The search query (text or regex pattern)."),
  contextLength: z.number().int().positive().optional().default(100).describe("Characters of context around matches."),
  modified_since: z.string().optional().describe("Filter by modification date (e.g., '2 weeks ago', '2024-01-15')."),
  modified_until: z.string().optional().describe("Filter by modification date (e.g., 'today', '2024-03-20 17:00')."),
  useRegex: z.boolean().optional().default(false).describe("Treat 'query' as regex. Defaults to false."),
  caseSensitive: z.boolean().optional().default(false).describe("Perform case-sensitive search. Defaults to false."),
  maxResults: z.number().int().positive().optional().default(50).describe("Maximum number of result files to return. Defaults to 50."),
}).describe("Performs search across vault content using text or regex. Supports filtering by modification date.");

export const ObsidianGlobalSearchInputSchemaShape = ObsidianGlobalSearchInputSchema.shape;
export type ObsidianGlobalSearchInput = z.infer<typeof ObsidianGlobalSearchInputSchema>;

// ====================================================================================
// Response Structure Definition (Updated)
// ====================================================================================
export interface MatchContext {
  lineNumber: number; // Still -1 when from API fallback
  context: string;
  matchText?: string; // Made optional
  position?: number; // Made optional (Position relative to the start of the context snippet)
}

export interface GlobalSearchResult extends Partial<NoteStat> {
  path: string;
  filename: string;
  matches: MatchContext[];
  score?: number;
  mtime?: number;
}

export interface ObsidianGlobalSearchResponse {
  success: boolean;
  message: string;
  results: GlobalSearchResult[];
  totalFilesFound: number;
  totalMatchesFound: number;
}

// ====================================================================================
// Helper Function (findMatchesInContent - for Cache Fallback)
// ====================================================================================
function findMatchesInContent(
  content: string, query: string, useRegex: boolean, caseSensitive: boolean, contextLength: number, context: RequestContext
): MatchContext[] {
  const matches: MatchContext[] = [];
  let regex: RegExp;
  const operation = 'findMatchesInContent';
  const opContext = { ...context, operation };
  try {
    const flags = `g${caseSensitive ? '' : 'i'}`;
    regex = useRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch (e) {
    const errorMsg = `[${operation}] Invalid regex pattern: ${query}`;
    logger.error(errorMsg, e instanceof Error ? e : undefined, opContext);
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid regex pattern: ${query}`, opContext);
  }
  let match;
  const lines = content.split('\n');
  const lineStartIndices = lines.reduce<number[]>((acc, line, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1] + lines[index - 1].length + 1);
    return acc;
  }, []);
  while ((match = regex.exec(content)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];
    let lineNumber = 1;
    for (let i = lineStartIndices.length - 1; i >= 0; i--) {
      if (matchIndex >= lineStartIndices[i]) {
        lineNumber = i + 1;
        break;
      }
    }
    const startIndex = Math.max(0, matchIndex - contextLength);
    const endIndex = Math.min(content.length, matchIndex + matchText.length + contextLength);
    const contextSnippet = content.substring(startIndex, endIndex);
    // Find position *within* the snippet for consistency with API fallback
    const positionInSnippet = contextSnippet.toLowerCase().indexOf(matchText.toLowerCase());

    matches.push({
        lineNumber,
        context: contextSnippet,
        matchText: matchText, // Included for cache search
        position: positionInSnippet >= 0 ? positionInSnippet : 0 // Included for cache search
    });
    if (matchText.length === 0) regex.lastIndex++;
  }
  return matches;
}

// ====================================================================================
// Core Logic Function (API-First with Cache Fallback)
// ====================================================================================
const API_SEARCH_TIMEOUT_MS = 30000; // 30 seconds internal timeout for API call

export const processObsidianGlobalSearch = async (
  params: ObsidianGlobalSearchInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService
): Promise<ObsidianGlobalSearchResponse> => {
  const operation = 'processObsidianGlobalSearch';
  const opContext = { ...context, operation };
  logger.info(`Processing obsidian_global_search request: "${params.query}" (API-first)`, { ...opContext, params: sanitizeInputForLogging(params) });

  let sinceDate: Date | null = null;
  let untilDate: Date | null = null;
  let strategyMessage = "";
  let searchResults: GlobalSearchResult[] = [];
  let totalMatchesCount = 0;

  // 1. Parse Date Filters
  const dateParseContext = { ...opContext, subOperation: 'parseDates' };
  try {
    if (params.modified_since) sinceDate = await dateParser.parseDate(params.modified_since, dateParseContext);
    if (params.modified_until) untilDate = await dateParser.parseDate(params.modified_until, dateParseContext);
  } catch (error) {
    const errMsg = `Invalid date format provided`;
    logger.error(errMsg, error instanceof Error ? error : undefined, dateParseContext);
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, errMsg, dateParseContext);
  }

  // 2. Attempt API Search with Timeout
  let apiFailedOrTimedOut = false;
  try {
    strategyMessage = `Attempting live API search (timeout: ${API_SEARCH_TIMEOUT_MS / 1000}s). `;
    const apiSearchContext = { ...opContext, subOperation: 'searchApiSimple' };
    logger.info(`Calling obsidianService.searchSimple for query: "${params.query}"`, apiSearchContext);

    // Promise for the API call
    const apiCallPromise = obsidianService.searchSimple(
      params.query, // Note: API might not support regex/caseSensitive here
      params.contextLength,
      apiSearchContext
    );

    // Promise for the timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`API search timed out after ${API_SEARCH_TIMEOUT_MS}ms`)), API_SEARCH_TIMEOUT_MS)
    );

    // Race the API call against the timeout
    const apiResults: SimpleSearchResult[] = await Promise.race([apiCallPromise, timeoutPromise]);

    strategyMessage += `API search successful, returned ${apiResults.length} potential files. `;
    logger.info(`API searchSimple returned ${apiResults.length} files with potential matches.`, apiSearchContext);

    // Process API results (fetch stats for date filtering if needed, limit results)
    const fetchStatsContext = { ...opContext, subOperation: 'fetchStatsForApiResults' };
    let processedCount = 0;
    for (const apiResult of apiResults) {
      if (searchResults.length >= params.maxResults!) break;

      const filePathFromApi = apiResult.filename; // API uses 'filename' for the full path
      let mtime: number | undefined;

      if (sinceDate || untilDate) {
        try {
          const noteJson = await obsidianService.getFileContent(filePathFromApi, 'json', fetchStatsContext) as NoteJson;
          mtime = noteJson.stat.mtime;
          if ((sinceDate && mtime < sinceDate.getTime()) || (untilDate && mtime > untilDate.getTime())) {
            continue; // Skip due to date filter
          }
        } catch (statError) {
          logger.warning(`Failed to fetch stats for file ${filePathFromApi} during API date filtering. Skipping file. Error: ${statError instanceof Error ? statError.message : String(statError)}`, fetchStatsContext);
          continue;
        }
      }

      // TODO: Implement post-filtering for regex/case sensitivity if needed based on API limitations.
      // If params.useRegex or !params.caseSensitive, we might need to re-validate matches here.

      // Transform SimpleSearchMatch[] to MatchContext[] - OMITTING matchText and position
      const transformedMatches: MatchContext[] = [];
      for (const apiMatch of apiResult.matches) {
          transformedMatches.push({
              lineNumber: -1, // Line number is not available
              context: apiMatch.context, // Use the context provided by the API
              // matchText and position are omitted as they cannot be reliably determined from API result
          });
      }

      // Only add if we actually found matches after transformation/filtering
      if (transformedMatches.length > 0) {
          searchResults.push({
            path: filePathFromApi,
            filename: path.basename(filePathFromApi),
            matches: transformedMatches,
            score: apiResult.score,
            mtime: mtime,
          });
          totalMatchesCount += transformedMatches.length; // Count matches provided by API
          processedCount++;
      }
    }
    strategyMessage += `Processed ${processedCount} files after filtering. `;

  } catch (apiError) {
    // API call failed or timed out internally
    apiFailedOrTimedOut = true;
    strategyMessage += `API search failed or timed out (${apiError instanceof Error ? apiError.message : String(apiError)}). `;
    logger.warning(strategyMessage, { ...opContext, subOperation: 'apiSearchFailedOrTimedOut' });
  }

  // 3. Fallback to Cache if API Failed/Timed Out
  if (apiFailedOrTimedOut) {
    if (vaultCacheService.isReady()) {
      strategyMessage += "Falling back to in-memory cache. ";
      logger.info("API search failed/timed out. Falling back to in-memory cache.", opContext);
      const cache = vaultCacheService.getCache();
      const cacheSearchContext = { ...opContext, subOperation: 'searchCacheFallback' };
      searchResults = []; // Reset results for cache search
      totalMatchesCount = 0;

      for (const [filePath, cacheEntry] of cache.entries()) {
        if (searchResults.length >= params.maxResults!) break;

        if ((sinceDate && cacheEntry.mtime < sinceDate.getTime()) || (untilDate && cacheEntry.mtime > untilDate.getTime())) {
          continue;
        }

        try {
          const matches = findMatchesInContent(
            cacheEntry.content, params.query, params.useRegex!, params.caseSensitive!, params.contextLength!, cacheSearchContext
          );
          if (matches.length > 0) {
            searchResults.push({
              path: filePath,
              filename: path.basename(filePath),
              mtime: cacheEntry.mtime,
              matches: matches, // Cache search provides accurate matches including text/position
            });
            totalMatchesCount += matches.length;
          }
        } catch (matchError) {
          logger.warning(`Error matching content in cached file ${filePath} during fallback: ${matchError instanceof Error ? matchError.message : String(matchError)}`, cacheSearchContext);
        }
      }
      strategyMessage += `Searched ${cache.size} cached files. `;
    } else {
      strategyMessage += "Cache not ready, unable to fallback. ";
      logger.error("API search failed and cache is not ready. Returning empty results.", opContext);
      // Return empty results as neither source is available/working
      searchResults = [];
      totalMatchesCount = 0;
    }
  }

  // 4. Construct Final Response
  const totalFilesFound = searchResults.length;
  const finalMessage = `${strategyMessage}Found ${totalMatchesCount} matches across ${totalFilesFound} files matching all criteria. Returning ${searchResults.length} files (limited by maxResults=${params.maxResults}).`;

  const response: ObsidianGlobalSearchResponse = {
    success: true, // Indicate overall tool success, even if fallback was used or results are empty
    message: finalMessage,
    results: searchResults,
    totalFilesFound: totalFilesFound,
    totalMatchesFound: totalMatchesCount,
  };

  logger.info(`Global search processing completed. ${finalMessage}`, opContext);
  return response;
}
