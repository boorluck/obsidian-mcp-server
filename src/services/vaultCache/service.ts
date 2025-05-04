/**
 * @module VaultCacheService
 * @description Service for building and managing an in-memory cache of Obsidian vault content.
 */

import { NoteJson, ObsidianRestApiService } from '../obsidianRestAPI/index.js';
import { logger, RequestContext, requestContextService } from '../../utils/index.js';
import { BaseErrorCode, McpError } from '../../types-global/errors.js';
import path from 'node:path';

interface CacheEntry {
  content: string;
  mtime: number; // Store modification time for date filtering
  // Add other stats if needed, e.g., ctime, size
}

export class VaultCacheService {
  private vaultContentCache: Map<string, CacheEntry> = new Map();
  private isCacheReady: boolean = false;
  private isBuilding: boolean = false;
  private obsidianService: ObsidianRestApiService;

  constructor(obsidianService: ObsidianRestApiService) {
    this.obsidianService = obsidianService;
    logger.info("VaultCacheService initialized.", { operation: 'VaultCacheServiceInit' });
  }

  /**
   * Checks if the cache has been successfully built.
   * @returns {boolean} True if the cache is ready, false otherwise.
   */
  public isReady(): boolean {
    return this.isCacheReady;
  }

  /**
   * Checks if the cache is currently being built.
   * @returns {boolean} True if the cache build is in progress, false otherwise.
   */
  public getIsBuilding(): boolean {
    return this.isBuilding;
  }

  /**
   * Returns the entire vault content cache.
   * Use with caution for large vaults due to potential memory usage.
   * @returns {ReadonlyMap<string, CacheEntry>} The cache map.
   */
  public getCache(): ReadonlyMap<string, CacheEntry> {
    // Return a readonly view or copy if mutation is a concern
    return this.vaultContentCache;
  }

  /**
   * Retrieves a specific entry from the cache.
   * @param {string} filePath - The vault-relative path of the file.
   * @returns {CacheEntry | undefined} The cache entry or undefined if not found.
   */
  public getEntry(filePath: string): CacheEntry | undefined {
    return this.vaultContentCache.get(filePath);
  }

  /**
   * Builds the in-memory cache by fetching all markdown files and their content.
   * This is intended to be run in the background after server startup.
   */
  public async buildVaultCache(): Promise<void> {
    if (this.isBuilding) {
      logger.warning("Cache build already in progress. Skipping.", { operation: 'buildVaultCache' });
      return;
    }
    if (this.isCacheReady) {
        logger.info("Cache already built. Skipping.", { operation: 'buildVaultCache' });
        return;
    }

    this.isBuilding = true;
    this.isCacheReady = false;
    const context = requestContextService.createRequestContext({ operation: 'buildVaultCache' });
    logger.info("Starting vault cache build process...", context);

    try {
      const startTime = Date.now();
      const allMarkdownFiles = await this.listAllMarkdownFiles('/', context);
      const totalFiles = allMarkdownFiles.length;
      logger.info(`Found ${totalFiles} markdown files to cache.`, context);

      this.vaultContentCache.clear(); // Clear any previous cache attempt

      for (let i = 0; i < totalFiles; i++) {
        const filePath = allMarkdownFiles[i];
        const fileContext = { ...context, filePath, progress: `${i + 1}/${totalFiles}` };
        try {
          // Fetch NoteJson to get content and mtime efficiently
          const noteJson = await this.obsidianService.getFileContent(filePath, 'json', fileContext) as NoteJson;
          this.vaultContentCache.set(filePath, {
            content: noteJson.content,
            mtime: noteJson.stat.mtime,
          });
          if ((i + 1) % 50 === 0 || i === totalFiles - 1) { // Log progress periodically
            logger.info(`Caching progress: ${i + 1}/${totalFiles} files cached.`, fileContext);
          } else {
             logger.debug(`Cached file: ${filePath}`, fileContext);
          }
        } catch (error) {
          logger.error(`Failed to cache file: ${filePath}. Skipping. Error: ${error instanceof Error ? error.message : String(error)}`, fileContext);
          // Optionally add error details for debugging
          if (error instanceof Error) { logger.debug("File caching error details", { ...fileContext, errorDetails: error.stack || error.message }); }
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      this.isCacheReady = true;
      logger.info(`Vault cache build completed successfully in ${duration.toFixed(2)} seconds. Cached ${this.vaultContentCache.size} files.`, context);

    } catch (error) {
      logger.error(`Critical error during vault cache build process. Cache may be incomplete. Error: ${error instanceof Error ? error.message : String(error)}`, context);
       if (error instanceof Error) { logger.debug("Cache build critical error details", { ...context, errorDetails: error.stack || error.message }); }
      // Keep isCacheReady as false
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Helper to recursively list all markdown files. Similar to the one in search logic.
   * @param dirPath - Starting directory path.
   * @param context - Request context.
   * @param visitedDirs - Set to track visited directories.
   * @returns Array of file paths.
   */
  private async listAllMarkdownFiles(
    dirPath: string,
    context: RequestContext,
    visitedDirs: Set<string> = new Set()
  ): Promise<string[]> {
    const operation = 'listAllMarkdownFiles';
    const opContext = { ...context, operation, dirPath };
    const normalizedPath = path.posix.normalize(dirPath === "" ? "/" : dirPath);

    if (visitedDirs.has(normalizedPath)) {
      logger.warning(`Cycle detected or directory already visited during cache build: ${normalizedPath}. Skipping.`, opContext);
      return [];
    }
    visitedDirs.add(normalizedPath);

    let markdownFiles: string[] = [];
    try {
      const entries = await this.obsidianService.listFiles(normalizedPath, opContext);
      for (const entry of entries) {
        const fullPath = path.posix.join(normalizedPath, entry);
        if (entry.endsWith('/')) {
          const subDirFiles = await this.listAllMarkdownFiles(fullPath, opContext, visitedDirs);
          markdownFiles = markdownFiles.concat(subDirFiles);
        } else if (entry.toLowerCase().endsWith('.md')) {
          markdownFiles.push(fullPath);
        }
      }
      return markdownFiles;
    } catch (error) {
      const errMsg = `Failed to list directory during cache build scan: ${normalizedPath}`;
      if (error instanceof McpError && error.code === BaseErrorCode.NOT_FOUND) {
        logger.warning(`${errMsg} - Directory not found, skipping.`, opContext);
        return [];
      }
      // Log and re-throw critical listing errors
      if (error instanceof Error) { logger.error(errMsg, error, opContext); } else { logger.error(errMsg, opContext); }
      const errorCode = error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR;
      throw new McpError(errorCode, `${errMsg}: ${error instanceof Error ? error.message : String(error)}`, opContext);
    }
  }
}
