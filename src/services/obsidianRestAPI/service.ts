/**
 * @module ObsidianRestApiService
 * @description
 * This module provides the core implementation for the Obsidian REST API service.
 * It encapsulates the logic for making authenticated requests to the API endpoints.
 */

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import https from 'node:https'; // Import the https module for Agent configuration
import { config } from '../../config/index.js';
import { BaseErrorCode, McpError } from '../../types-global/errors.js';
import { ErrorHandler, logger, RequestContext } from '../../utils/index.js';
import * as activeFileMethods from './methods/activeFileMethods.js';
import * as commandMethods from './methods/commandMethods.js';
import * as openMethods from './methods/openMethods.js';
import * as patchMethods from './methods/patchMethods.js';
import * as periodicNoteMethods from './methods/periodicNoteMethods.js';
import * as searchMethods from './methods/searchMethods.js';
import * as vaultMethods from './methods/vaultMethods.js';
import {
  ApiStatusResponse, // Import PatchOptions type
  ComplexSearchResult,
  NoteJson,
  ObsidianCommand,
  PatchOptions,
  Period,
  SimpleSearchResult,
} from './types.js'; // Import types from the new file

// Define the type for the internal request function signature, used by method files
export type RequestFunction = <T = any>(
  config: AxiosRequestConfig,
  context: RequestContext,
  operationName: string
) => Promise<T>;

export class ObsidianRestApiService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = config.obsidianApiKey; // Get from central config
    if (!this.apiKey) {
      // Config validation should prevent this, but double-check
      throw new McpError(BaseErrorCode.CONFIGURATION_ERROR, "Obsidian API Key is missing in configuration.", {});
    }

    this.axiosInstance = axios.create({
      baseURL: config.obsidianBaseUrl.replace(/\/$/, ''), // Remove trailing slash
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json', // Default accept type
      },
      timeout: 15000, // Default timeout of 15 seconds
      // Configure httpsAgent to handle SSL verification based on config
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.obsidianVerifySsl, // Use the boolean value from config
      }),
    });

    logger.info(`ObsidianRestApiService initialized with base URL: ${this.axiosInstance.defaults.baseURL}, Verify SSL: ${config.obsidianVerifySsl}`, { operation: 'ObsidianServiceInit' });
  }

  /**
   * Private helper to make requests and handle common errors.
   * @param config - Axios request configuration.
   * @param context - Request context for logging.
   * @param operationName - Name of the operation for logging context.
   * @returns The response data.
   * @throws {McpError} If the request fails.
   */
  private async _request<T = any>(
    config: AxiosRequestConfig,
    context: RequestContext,
    operationName: string
  ): Promise<T> {
    const operationContext = { ...context, operation: `ObsidianAPI_${operationName}` };
    logger.debug(`Making Obsidian API request: ${config.method} ${config.url}`, operationContext);

    return await ErrorHandler.tryCatch(async () => {
      try {
        const response = await this.axiosInstance.request<T>(config);
        logger.debug(`Obsidian API request successful: ${config.method} ${config.url}`, { ...operationContext, status: response.status });
        // For 204 No Content, response.data might be empty, handle appropriately
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        let errorCode = BaseErrorCode.INTERNAL_ERROR;
        let errorMessage = `Obsidian API request failed: ${axiosError.message}`;
        const errorDetails: Record<string, any> = {
            requestUrl: config.url,
            requestMethod: config.method,
            responseStatus: axiosError.response?.status,
            responseData: axiosError.response?.data,
        };

        if (axiosError.response) {
          // Handle specific HTTP status codes
          switch (axiosError.response.status) {
            case 400:
              errorCode = BaseErrorCode.VALIDATION_ERROR;
              errorMessage = `Obsidian API Bad Request: ${JSON.stringify(axiosError.response.data)}`;
              break;
            case 401:
              errorCode = BaseErrorCode.UNAUTHORIZED;
              errorMessage = "Obsidian API Unauthorized: Invalid API Key.";
              break;
            case 403:
              errorCode = BaseErrorCode.FORBIDDEN;
              errorMessage = "Obsidian API Forbidden: Check permissions.";
              break;
            case 404:
              errorCode = BaseErrorCode.NOT_FOUND;
              errorMessage = `Obsidian API Not Found: ${config.url}`;
              // Log 404s at debug level, as they might be expected (e.g., checking existence)
              logger.debug(errorMessage, { ...operationContext, ...errorDetails });
              throw new McpError(errorCode, errorMessage, operationContext);
              // NOTE: We throw immediately after logging debug for 404, skipping the general error log below.
            case 405:
              errorCode = BaseErrorCode.VALIDATION_ERROR; // Method not allowed often implies incorrect usage
              errorMessage = `Obsidian API Method Not Allowed: ${config.method} on ${config.url}`;
              break;
            case 503:
              errorCode = BaseErrorCode.SERVICE_UNAVAILABLE;
              errorMessage = "Obsidian API Service Unavailable.";
              break;
          }
          // General error logging for non-404 client/server errors handled above
          logger.error(errorMessage, { ...operationContext, ...errorDetails });
          throw new McpError(errorCode, errorMessage, operationContext);
        } else if (axiosError.request) {
          // Network error (no response received)
          errorCode = BaseErrorCode.SERVICE_UNAVAILABLE;
          errorMessage = `Obsidian API Network Error: No response received from ${config.url}`;
          logger.error(errorMessage, { ...operationContext, ...errorDetails });
          throw new McpError(errorCode, errorMessage, operationContext);
        } else {
          // Other errors (e.g., setup issues)
          // Pass error object correctly if it's an Error instance
          logger.error(errorMessage, error instanceof Error ? error : undefined, { ...operationContext, ...errorDetails, originalError: String(error) });
          throw new McpError(errorCode, errorMessage, operationContext);
        }
      }
    }, {
        operation: `ObsidianAPI_${operationName}_Wrapper`,
        context: context,
        input: config, // Log request config (sanitized by ErrorHandler)
        errorCode: BaseErrorCode.INTERNAL_ERROR, // Default if wrapper itself fails
    });
  }

  // --- API Methods ---

  /**
   * Checks the status and authentication of the Obsidian Local REST API.
   * @param context - The request context for logging and correlation.
   * @returns {Promise<ApiStatusResponse>} - The status object from the API.
   */
  async checkStatus(context: RequestContext): Promise<ApiStatusResponse> {
    // Note: This is the only endpoint that doesn't strictly require auth,
    // but sending the key helps check if it's valid.
    // This one is simple enough to keep inline or could be extracted too.
    return this._request<ApiStatusResponse>({
      method: 'GET',
      url: '/',
    }, context, 'checkStatus');
  }

  // --- Vault Methods ---

  /**
   * Gets the content of a specific file in the vault.
   * @param filePath - Vault-relative path to the file.
   * @param format - 'markdown' or 'json' (for NoteJson).
   * @param context - Request context.
   * @returns The file content (string) or NoteJson object.
   */
  async getFileContent(filePath: string, format: 'markdown' | 'json' = 'markdown', context: RequestContext): Promise<string | NoteJson> {
    return vaultMethods.getFileContent(this._request.bind(this), filePath, format, context);
  }

   /**
   * Updates (overwrites) the content of a file or creates it if it doesn't exist.
   * @param filePath - Vault-relative path to the file.
   * @param content - The new content for the file.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async updateFileContent(filePath: string, content: string, context: RequestContext): Promise<void> {
    return vaultMethods.updateFileContent(this._request.bind(this), filePath, content, context);
  }

  /**
   * Appends content to the end of a file. Creates the file if it doesn't exist.
   * @param filePath - Vault-relative path to the file.
   * @param content - The content to append.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async appendFileContent(filePath: string, content: string, context: RequestContext): Promise<void> {
    return vaultMethods.appendFileContent(this._request.bind(this), filePath, content, context);
  }

   /**
   * Deletes a specific file in the vault.
   * @param filePath - Vault-relative path to the file.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async deleteFile(filePath: string, context: RequestContext): Promise<void> {
    return vaultMethods.deleteFile(this._request.bind(this), filePath, context);
  }

   /**
   * Lists files within a specified directory in the vault.
   * @param dirPath - Vault-relative path to the directory. Use empty string "" or "/" for the root.
   * @param context - Request context.
   * @returns A list of file and directory names.
   */
  async listFiles(dirPath: string, context: RequestContext): Promise<string[]> {
    return vaultMethods.listFiles(this._request.bind(this), dirPath, context);
  }

  // --- Search Methods ---

  /**
   * Performs a simple text search across the vault.
   * @param query - The text query string.
   * @param contextLength - Number of characters surrounding each match (default 100).
   * @param context - Request context.
   * @returns An array of search results.
   */
  async searchSimple(query: string, contextLength: number = 100, context: RequestContext): Promise<SimpleSearchResult[]> {
    return searchMethods.searchSimple(this._request.bind(this), query, contextLength, context);
  }

  /**
   * Performs a complex search using Dataview DQL or JsonLogic.
   * @param query - The query string (DQL) or JSON object (JsonLogic).
   * @param contentType - The content type header indicating the query format.
   * @param context - Request context.
   * @returns An array of search results.
   */
  async searchComplex(query: string | object, contentType: 'application/vnd.olrapi.dataview.dql+txt' | 'application/vnd.olrapi.jsonlogic+json', context: RequestContext): Promise<ComplexSearchResult[]> {
    return searchMethods.searchComplex(this._request.bind(this), query, contentType, context);
  }

  // --- Command Methods ---

  /**
   * Executes a registered Obsidian command by its ID.
   * @param commandId - The ID of the command (e.g., "app:go-back").
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async executeCommand(commandId: string, context: RequestContext): Promise<void> {
    return commandMethods.executeCommand(this._request.bind(this), commandId, context);
  }

   /**
   * Lists all available Obsidian commands.
   * @param context - Request context.
   * @returns A list of available commands.
   */
  async listCommands(context: RequestContext): Promise<ObsidianCommand[]> {
    return commandMethods.listCommands(this._request.bind(this), context);
  }

  // --- Open Methods ---

  /**
   * Opens a specific file in Obsidian. Creates the file if it doesn't exist.
   * @param filePath - Vault-relative path to the file.
   * @param newLeaf - Whether to open the file in a new editor tab (leaf).
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (200 OK, but no body expected).
   */
  async openFile(filePath: string, newLeaf: boolean = false, context: RequestContext): Promise<void> {
    return openMethods.openFile(this._request.bind(this), filePath, newLeaf, context);
  }

   // --- Active File Methods ---

  /**
   * Gets the content of the currently active file in Obsidian.
   * @param format - 'markdown' or 'json' (for NoteJson).
   * @param context - Request context.
   * @returns The file content (string) or NoteJson object.
   */
  async getActiveFile(format: 'markdown' | 'json' = 'markdown', context: RequestContext): Promise<string | NoteJson> {
    return activeFileMethods.getActiveFile(this._request.bind(this), format, context);
  }

   /**
   * Updates (overwrites) the content of the currently active file.
   * @param content - The new content.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async updateActiveFile(content: string, context: RequestContext): Promise<void> {
    return activeFileMethods.updateActiveFile(this._request.bind(this), content, context);
  }

   /**
   * Appends content to the end of the currently active file.
   * @param content - The content to append.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async appendActiveFile(content: string, context: RequestContext): Promise<void> {
    return activeFileMethods.appendActiveFile(this._request.bind(this), content, context);
  }

   /**
   * Deletes the currently active file.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async deleteActiveFile(context: RequestContext): Promise<void> {
    return activeFileMethods.deleteActiveFile(this._request.bind(this), context);
  }

   // --- Periodic Notes Methods ---
  // PATCH methods for periodic notes are complex and omitted for brevity

  /**
   * Gets the content of a periodic note (daily, weekly, etc.).
   * @param period - The period type ('daily', 'weekly', 'monthly', 'quarterly', 'yearly').
   * @param format - 'markdown' or 'json'.
   * @param context - Request context.
   * @returns The note content or NoteJson.
   */
  async getPeriodicNote(period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', format: 'markdown' | 'json' = 'markdown', context: RequestContext): Promise<string | NoteJson> {
    return periodicNoteMethods.getPeriodicNote(this._request.bind(this), period, format, context);
  }

   /**
   * Updates (overwrites) the content of a periodic note. Creates if needed.
   * @param period - The period type.
   * @param content - The new content.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async updatePeriodicNote(period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', content: string, context: RequestContext): Promise<void> {
    return periodicNoteMethods.updatePeriodicNote(this._request.bind(this), period, content, context);
  }

   /**
   * Appends content to a periodic note. Creates if needed.
   * @param period - The period type.
   * @param content - The content to append.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async appendPeriodicNote(period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', content: string, context: RequestContext): Promise<void> {
    return periodicNoteMethods.appendPeriodicNote(this._request.bind(this), period, content, context);
  }

   /**
   * Deletes a periodic note.
   * @param period - The period type.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (204 No Content).
   */
  async deletePeriodicNote(period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', context: RequestContext): Promise<void> {
    return periodicNoteMethods.deletePeriodicNote(this._request.bind(this), period, context);
  }

  // --- Patch Methods ---

  /**
   * Patches a specific file in the vault using granular controls.
   * @param filePath - Vault-relative path to the file.
   * @param content - The content to insert/replace (string or JSON for tables/frontmatter).
   * @param options - Patch operation details (operation, targetType, target, etc.).
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (200 OK).
   */
  async patchFile(filePath: string, content: string | object, options: PatchOptions, context: RequestContext): Promise<void> {
    return patchMethods.patchFile(this._request.bind(this), filePath, content, options, context);
  }

  /**
   * Patches the currently active file in Obsidian using granular controls.
   * @param content - The content to insert/replace.
   * @param options - Patch operation details.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (200 OK).
   */
  async patchActiveFile(content: string | object, options: PatchOptions, context: RequestContext): Promise<void> {
    return patchMethods.patchActiveFile(this._request.bind(this), content, options, context);
  }

  /**
   * Patches a periodic note using granular controls.
   * @param period - The period type ('daily', 'weekly', etc.).
   * @param content - The content to insert/replace.
   * @param options - Patch operation details.
   * @param context - Request context.
   * @returns {Promise<void>} Resolves on success (200 OK).
   */
  async patchPeriodicNote(period: Period, content: string | object, options: PatchOptions, context: RequestContext): Promise<void> {
    return patchMethods.patchPeriodicNote(this._request.bind(this), period, content, options, context);
  }
}
