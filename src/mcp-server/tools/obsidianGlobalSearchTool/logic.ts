import path from 'node:path';
import { z } from 'zod';
import { NoteJson, ObsidianRestApiService, SimpleSearchResult } from '../../../services/obsidianRestAPI/index.js'; // Removed NoteStat import
import { VaultCacheService } from '../../../services/vaultCache/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
// Import formatTimestamp utility
import { dateParser, formatTimestamp, logger, RequestContext, sanitizeInputForLogging } from '../../../utils/index.js';

// ====================================================================================
// Schema Definitions (Updated for Pagination, Match Limit, and Path Filter)
// ====================================================================================
const ObsidianGlobalSearchInputSchema = z.object({
  query: z.string().min(1).describe("The search query (text or regex pattern)."),
  searchInPath: z.string().optional().describe("Optional vault-relative path to recursively search within (e.g., 'Notes/Projects'). If omitted, searches the entire vault."),
  contextLength: z.number().int().positive().optional().default(100).describe("Characters of context around matches."),
  modified_since: z.string().optional().describe("Filter files modified *since* this date/time (e.g., '2 weeks ago', '2024-01-15')."),
  modified_until: z.string().optional().describe("Filter files modified *until* this date/time (e.g., 'today', '2024-03-20 17:00')."),
  useRegex: z.boolean().optional().default(false).describe("Treat 'query' as regex. Defaults to false."),
  caseSensitive: z.boolean().optional().default(false).describe("Perform case-sensitive search. Defaults to false."),
  pageSize: z.number().int().positive().optional().default(50).describe("Maximum number of result files per page. Defaults to 50."),
  page: z.number().int().positive().optional().default(1).describe("Page number of results to return. Defaults to 1."),
  maxMatchesPerFile: z.number().int().positive().optional().default(5).describe("Maximum number of matches to show per file. Defaults to 5."),
}).describe("Performs search across vault content using text or regex. Supports filtering by modification date, directory path, pagination, and limiting matches per file.");

export const ObsidianGlobalSearchInputSchemaShape = ObsidianGlobalSearchInputSchema.shape;
export type ObsidianGlobalSearchInput = z.infer<typeof ObsidianGlobalSearchInputSchema>;

// ====================================================================================
// Response Structure Definition (Updated)
// ====================================================================================
// Removed lineNumber from MatchContext
export interface MatchContext {
  context: string;
  matchText?: string; // Made optional
  position?: number; // Made optional (Position relative to the start of the context snippet)
}

// Updated GlobalSearchResult to use formatted time strings
export interface GlobalSearchResult {
  path: string;
  filename: string;
  matches: MatchContext[];
  modifiedTime: string; // Formatted string
  createdTime: string; // Formatted string
}

// Added alsoFoundInFiles
export interface ObsidianGlobalSearchResponse {
  success: boolean;
  message: string;
  results: GlobalSearchResult[];
  totalFilesFound: number; // Total files matching query *before* pagination
  totalMatchesFound: number; // Total matches across all found files *before* pagination
  currentPage: number;
  pageSize: number;
  totalPages: number;
  alsoFoundInFiles?: string[]; // List of filenames found but not on the current page
}

// ====================================================================================
// Helper Function (findMatchesInContent - for Cache Fallback)
// ====================================================================================
// Removed lineNumber calculation and return
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
  // Removed line number calculation logic
  while ((match = regex.exec(content)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];
    const startIndex = Math.max(0, matchIndex - contextLength);
    const endIndex = Math.min(content.length, matchIndex + matchText.length + contextLength);
    const contextSnippet = content.substring(startIndex, endIndex);
    // Find position *within* the snippet for consistency with API fallback
    const positionInSnippet = contextSnippet.toLowerCase().indexOf(matchText.toLowerCase());

    matches.push({
        // lineNumber removed
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
  let allFilteredResults: GlobalSearchResult[] = []; // Store all results matching filters before pagination
  let totalMatchesCount = 0; // Total matches across all files before limiting per file

  // Normalize searchInPath: remove leading/trailing slashes and ensure it ends with a slash if not empty
  const searchPathPrefix = params.searchInPath
    ? params.searchInPath.replace(/^\/+|\/+$/g, '') + (params.searchInPath === '/' ? '' : '/')
    : ''; // Empty string means search entire vault

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

    // Process API results (fetch stats for date filtering and inclusion)
    const fetchStatsContext = { ...opContext, subOperation: 'fetchStatsForApiResults' };
    let processedCount = 0;
    for (const apiResult of apiResults) {
      const filePathFromApi = apiResult.filename; // API uses 'filename' for the full path

      // Apply path filter
      if (searchPathPrefix && !filePathFromApi.startsWith(searchPathPrefix)) {
          continue; // Skip if file is not in the specified path
      }

      let mtime: number;
      let ctime: number;

      // Fetch stats regardless of date filtering to include in results
      try {
        const noteJson = await obsidianService.getFileContent(filePathFromApi, 'json', fetchStatsContext) as NoteJson;
        mtime = noteJson.stat.mtime;
        ctime = noteJson.stat.ctime; // Get ctime

        // Apply date filtering if needed
        if ((sinceDate && mtime < sinceDate.getTime()) || (untilDate && mtime > untilDate.getTime())) {
          continue; // Skip due to date filter
        }
      } catch (statError) {
        logger.warning(`Failed to fetch stats for file ${filePathFromApi}. Skipping file. Error: ${statError instanceof Error ? statError.message : String(statError)}`, fetchStatsContext);
        continue; // Skip if stats cannot be fetched
      }

      // Transform SimpleSearchMatch[] to MatchContext[] - OMITTING matchText and position
      const transformedMatches: MatchContext[] = [];
      for (const apiMatch of apiResult.matches) {
          transformedMatches.push({
              // lineNumber removed
              context: apiMatch.context, // Use the context provided by the API
              // matchText and position are omitted as they cannot be reliably determined from API result
          });
      }

      // Apply match limit per file
      const limitedMatches = transformedMatches.slice(0, params.maxMatchesPerFile);

      // Only add if we actually found matches after transformation/filtering
      if (limitedMatches.length > 0) {
          allFilteredResults.push({ // Add to the unfiltered list first
            path: filePathFromApi,
            filename: path.basename(filePathFromApi),
            matches: limitedMatches, // Use limited matches
            modifiedTime: formatTimestamp(mtime, fetchStatsContext), // Format mtime
            createdTime: formatTimestamp(ctime, fetchStatsContext), // Format ctime
          });
          totalMatchesCount += transformedMatches.length; // Count *all* matches before limiting for total count
          processedCount++;
      }
    }
    strategyMessage += `Processed ${processedCount} files matching all filters (including path: '${searchPathPrefix || 'entire vault'}'). `;

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
      allFilteredResults = []; // Reset results for cache search
      totalMatchesCount = 0;
      let processedCount = 0;

      for (const [filePath, cacheEntry] of cache.entries()) {
        // Apply path filter
        if (searchPathPrefix && !filePath.startsWith(searchPathPrefix)) {
            continue; // Skip if file is not in the specified path
        }

        const mtime = cacheEntry.mtime; // Get mtime from cache

        // Apply date filtering
        if ((sinceDate && mtime < sinceDate.getTime()) || (untilDate && mtime > untilDate.getTime())) {
          continue;
        }

        try {
          const matches = findMatchesInContent(
            cacheEntry.content, params.query, params.useRegex!, params.caseSensitive!, params.contextLength!, cacheSearchContext
          );

          // Apply match limit per file
          const limitedMatches = matches.slice(0, params.maxMatchesPerFile);

          if (limitedMatches.length > 0) {
            let ctime: number | null = null;
            // Attempt to fetch ctime as cache likely doesn't have it
            try {
                const noteJson = await obsidianService.getFileContent(filePath, 'json', cacheSearchContext) as NoteJson;
                ctime = noteJson.stat.ctime;
            } catch (statError) {
                logger.warning(`Failed to fetch ctime for cached file ${filePath} during fallback. Error: ${statError instanceof Error ? statError.message : String(statError)}`, cacheSearchContext);
                // Proceed without ctime if fetch fails
            }

            allFilteredResults.push({ // Add to unfiltered list
              path: filePath,
              filename: path.basename(filePath),
              modifiedTime: formatTimestamp(mtime, cacheSearchContext), // Format mtime
              createdTime: formatTimestamp(ctime ?? mtime, cacheSearchContext), // Format ctime (or mtime fallback)
              matches: limitedMatches, // Use limited matches
            });
            totalMatchesCount += matches.length; // Count *all* matches before limiting
            processedCount++;
          }
        } catch (matchError) {
          logger.warning(`Error matching content in cached file ${filePath} during fallback: ${matchError instanceof Error ? matchError.message : String(matchError)}`, cacheSearchContext);
        }
      }
      strategyMessage += `Searched ${cache.size} cached files, processed ${processedCount} matching all filters (including path: '${searchPathPrefix || 'entire vault'}'). `;
    } else {
      strategyMessage += "Cache not ready, unable to fallback. ";
      logger.error("API search failed and cache is not ready. Returning empty results.", opContext);
      // Return empty results as neither source is available/working
      allFilteredResults = [];
      totalMatchesCount = 0;
    }
  }

  // 4. Apply Pagination and Sorting
  const totalFilesFound = allFilteredResults.length;
  const pageSize = params.pageSize!;
  const currentPage = params.page!;
  const totalPages = Math.ceil(totalFilesFound / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Sort results by modified time (descending) *before* pagination
  allFilteredResults.sort((a, b) => {
      // Attempt to parse back to timestamp for sorting, handle potential 'Invalid Date'
      const timeA = new Date(a.modifiedTime.replace(' | ', ' ')).getTime();
      const timeB = new Date(b.modifiedTime.replace(' | ', ' ')).getTime();
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1; // Put invalid dates last
      if (isNaN(timeB)) return -1;
      return timeB - timeA; // Descending
  });

  const paginatedResults = allFilteredResults.slice(startIndex, endIndex);

  // 5. Determine alsoFoundInFiles
  let alsoFoundInFiles: string[] | undefined = undefined;
  if (totalPages > 1) {
      const paginatedPaths = new Set(paginatedResults.map(r => r.path));
      alsoFoundInFiles = allFilteredResults
          .map(r => r.filename) // Get filenames from all results
          .filter(filename => !paginatedPaths.has(allFilteredResults.find(r => r.filename === filename)!.path)); // Filter out those on current page
      // Remove duplicates if any (though filenames should be unique if paths are)
      alsoFoundInFiles = [...new Set(alsoFoundInFiles)];
  }


  // 6. Construct Final Response
  const finalMessage = `${strategyMessage}Found ${totalMatchesCount} matches across ${totalFilesFound} files matching all criteria. Returning page ${currentPage} of ${totalPages} (${paginatedResults.length} files on this page, page size ${pageSize}, max matches per file ${params.maxMatchesPerFile}). Results sorted by modification date (newest first).`;

  const response: ObsidianGlobalSearchResponse = {
    success: true, // Indicate overall tool success, even if fallback was used or results are empty
    message: finalMessage,
    results: paginatedResults,
    totalFilesFound: totalFilesFound,
    totalMatchesFound: totalMatchesCount,
    currentPage: currentPage,
    pageSize: pageSize,
    totalPages: totalPages,
    alsoFoundInFiles: alsoFoundInFiles, // Add the list here
  };

  logger.info(`Global search processing completed. ${finalMessage}`, opContext);
  return response;
}
