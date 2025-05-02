/**
 * @module CommandMethods
 * @description
 * Methods for interacting with Obsidian commands via the REST API.
 */

import { AxiosRequestConfig } from 'axios';
import { RequestContext } from '../../../utils/index.js';
import { ObsidianCommand, CommandListResponse } from '../types.js';

// Define a type for the internal request function signature
type RequestFunction = <T = any>(
  config: AxiosRequestConfig,
  context: RequestContext,
  operationName: string
) => Promise<T>;

/**
 * Executes a registered Obsidian command by its ID.
 * @param _request - The internal request function from the service instance.
 * @param commandId - The ID of the command (e.g., "app:go-back").
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (204 No Content).
 */
export async function executeCommand(
  _request: RequestFunction,
  commandId: string,
  context: RequestContext
): Promise<void> {
  await _request<void>({
    method: 'POST',
    url: `/commands/${encodeURIComponent(commandId)}/`,
  }, context, 'executeCommand');
}

/**
 * Lists all available Obsidian commands.
 * @param _request - The internal request function from the service instance.
 * @param context - Request context.
 * @returns A list of available commands.
 */
export async function listCommands(
  _request: RequestFunction,
  context: RequestContext
): Promise<ObsidianCommand[]> {
  const response = await _request<CommandListResponse>({
      method: 'GET',
      url: '/commands/',
  }, context, 'listCommands');
  return response.commands;
}
