/**
 * @module VaultMethods
 * @description
 * Methods for interacting with vault files and directories via the Obsidian REST API.
 */

import { AxiosRequestConfig } from 'axios';
import { RequestContext } from '../../../utils/index.js';
import { NoteJson, FileListResponse } from '../types.js';

// Define a type for the internal request function signature
type RequestFunction = <T = any>(
  config: AxiosRequestConfig,
  context: RequestContext,
  operationName: string
) => Promise<T>;

/**
 * Gets the content of a specific file in the vault.
 * @param _request - The internal request function from the service instance.
 * @param filePath - Vault-relative path to the file.
 * @param format - 'markdown' or 'json' (for NoteJson).
 * @param context - Request context.
 * @returns The file content (string) or NoteJson object.
 */
export async function getFileContent(
  _request: RequestFunction,
  filePath: string,
  format: 'markdown' | 'json' = 'markdown',
  context: RequestContext
): Promise<string | NoteJson> {
  const acceptHeader = format === 'json' ? 'application/vnd.olrapi.note+json' : 'text/markdown';
  return _request<string | NoteJson>({
    method: 'GET',
    url: `/vault/${encodeURIComponent(filePath)}`,
    headers: { 'Accept': acceptHeader },
  }, context, 'getFileContent');
}

/**
 * Updates (overwrites) the content of a file or creates it if it doesn't exist.
 * @param _request - The internal request function from the service instance.
 * @param filePath - Vault-relative path to the file.
 * @param content - The new content for the file.
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (204 No Content).
 */
export async function updateFileContent(
  _request: RequestFunction,
  filePath: string,
  content: string,
  context: RequestContext
): Promise<void> {
  // PUT returns 204 No Content, so the expected type is void
  await _request<void>({
    method: 'PUT',
    url: `/vault/${encodeURIComponent(filePath)}`,
    headers: { 'Content-Type': 'text/markdown' },
    data: content,
  }, context, 'updateFileContent');
}

/**
 * Appends content to the end of a file. Creates the file if it doesn't exist.
 * @param _request - The internal request function from the service instance.
 * @param filePath - Vault-relative path to the file.
 * @param content - The content to append.
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (204 No Content).
 */
export async function appendFileContent(
  _request: RequestFunction,
  filePath: string,
  content: string,
  context: RequestContext
): Promise<void> {
  await _request<void>({
      method: 'POST',
      url: `/vault/${encodeURIComponent(filePath)}`,
      headers: { 'Content-Type': 'text/markdown' },
      data: content,
  }, context, 'appendFileContent');
}

/**
 * Deletes a specific file in the vault.
 * @param _request - The internal request function from the service instance.
 * @param filePath - Vault-relative path to the file.
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (204 No Content).
 */
export async function deleteFile(
  _request: RequestFunction,
  filePath: string,
  context: RequestContext
): Promise<void> {
  await _request<void>({
    method: 'DELETE',
    url: `/vault/${encodeURIComponent(filePath)}`,
  }, context, 'deleteFile');
}

/**
 * Lists files within a specified directory in the vault.
 * @param _request - The internal request function from the service instance.
 * @param dirPath - Vault-relative path to the directory. Use empty string "" or "/" for the root.
 * @param context - Request context.
 * @returns A list of file and directory names.
 */
export async function listFiles(
  _request: RequestFunction,
  dirPath: string,
  context: RequestContext
): Promise<string[]> {
  // Normalize path: remove leading/trailing slashes for consistency, except for root
  let normalizedPath = dirPath.trim();
  if (normalizedPath !== '' && normalizedPath !== '/') {
      normalizedPath = normalizedPath.replace(/^\/+|\/+$/g, '');
  }

  const url = normalizedPath ? `/vault/${encodeURIComponent(normalizedPath)}/` : '/vault/';
  const response = await _request<FileListResponse>({
    method: 'GET',
    url: url,
  }, context, 'listFiles');
  return response.files;
}
