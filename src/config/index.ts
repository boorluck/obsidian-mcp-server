import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from 'zod';

dotenv.config(); // Load environment variables from .env file

// Determine the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Construct the path to package.json relative to the current file
const pkgPath = join(__dirname, '../../package.json');
// Default package information in case package.json is unreadable
let pkg = { name: 'mcp-ts-template', version: '0.0.0' };

try {
  // Read and parse package.json to get default server name and version
  pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
} catch (error) {
  // Silently use default pkg info if reading fails.
  // Consider adding logging here if robust error handling is needed.
  console.error("Warning: Could not read package.json for default config values.", error);
}

// Define a schema for environment variables for validation and type safety
const EnvSchema = z.object({
  MCP_SERVER_NAME: z.string().optional(),
  MCP_SERVER_VERSION: z.string().optional(),
  MCP_LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.string().default("development"),
  MCP_TRANSPORT_TYPE: z.enum(['stdio', 'http']).default('stdio'),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010), // Updated default port
  MCP_HTTP_HOST: z.string().default('127.0.0.1'),
  MCP_ALLOWED_ORIGINS: z.string().optional(), // Comma-separated string
  MCP_AUTH_SECRET_KEY: z.string().min(32, "MCP_AUTH_SECRET_KEY must be at least 32 characters long for security").optional(), // Secret for signing/verifying tokens
  // --- Obsidian Specific Config ---
  OBSIDIAN_API_KEY: z.string().min(1, "OBSIDIAN_API_KEY cannot be empty"), // Required, non-empty string
  OBSIDIAN_BASE_URL: z.string().url().default('http://127.0.0.1:27123'), // Optional, defaults to insecure HTTP
  OBSIDIAN_VERIFY_SSL: z.string() // Treat env var as string ('true'/'false')
    .transform(val => val.toLowerCase() === 'true') // Convert to boolean
    .optional()
    .default('true'), // Default to true (verify SSL)
});

// Parse and validate environment variables
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.flatten().fieldErrors);
  // For critical configs like the API key, throw an error if validation fails.
  throw new Error(`Invalid environment configuration: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`);
}

// Check specifically for OBSIDIAN_API_KEY after successful parsing, as it's critical
if (!parsedEnv.data.OBSIDIAN_API_KEY) {
    console.error("❌ Missing critical environment variable: OBSIDIAN_API_KEY");
    throw new Error("OBSIDIAN_API_KEY environment variable is required but not set.");
}


const env = parsedEnv.data; // Use the validated data

/**
 * Main application configuration object.
 * Aggregates settings from environment variables and package.json.
 */
export const config = {
  /**
   * The name of the MCP server.
   * Prioritizes MCP_SERVER_NAME env var, falls back to package.json name.
   * Default: 'mcp-ts-template' (from package.json)
   */
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,

  /**
   * The version of the MCP server.
   * Prioritizes MCP_SERVER_VERSION env var, falls back to package.json version.
   * Default: (from package.json)
   */
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,

  /**
   * Logging level for the application (e.g., "debug", "info", "warning", "error").
   * Controlled by MCP_LOG_LEVEL env var.
   * Default: "info"
   */
  logLevel: env.MCP_LOG_LEVEL,

  /**
   * The runtime environment (e.g., "development", "production").
   * Controlled by NODE_ENV env var.
   * Default: "development"
   */
  environment: env.NODE_ENV,

  /**
   * Specifies the transport mechanism for the server.
   * Controlled by MCP_TRANSPORT_TYPE env var. Options: 'stdio', 'http'.
   * Default: "stdio"
   */
  mcpTransportType: env.MCP_TRANSPORT_TYPE,

  /**
   * The port number for the HTTP server to listen on (if MCP_TRANSPORT_TYPE is 'http').
   * Controlled by MCP_HTTP_PORT env var.
   * Default: 3010
   */
  mcpHttpPort: env.MCP_HTTP_PORT,

  /**
   * The host address for the HTTP server to bind to (if MCP_TRANSPORT_TYPE is 'http').
   * Controlled by MCP_HTTP_HOST env var.
   * Default: "127.0.0.1"
   */
  mcpHttpHost: env.MCP_HTTP_HOST,

  /**
   * Comma-separated list of allowed origins for CORS requests when using the 'http' transport.
   * Controlled by MCP_ALLOWED_ORIGINS env var.
   * Default: undefined (meaning CORS might be restrictive by default in the transport layer)
   */
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean),

  /**
   * A secret key used for signing and verifying authentication tokens (e.g., JWT).
   * MUST be set in production for HTTP transport security.
   * Controlled by MCP_AUTH_SECRET_KEY env var.
   * Default: undefined (Auth middleware should throw error if not set in production)
   */
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,

  /**
   * The API key for accessing the Obsidian Local REST API.
   * Controlled by OBSIDIAN_API_KEY env var.
   * Required.
   */
  obsidianApiKey: env.OBSIDIAN_API_KEY,

  /**
   * The base URL for the Obsidian Local REST API.
   * Controlled by OBSIDIAN_BASE_URL env var.
   * Default: "http://127.0.0.1:27123"
   */
  obsidianBaseUrl: env.OBSIDIAN_BASE_URL,

  /**
   * Whether to verify the SSL certificate of the Obsidian Local REST API server.
   * Set to false if using HTTPS with a self-signed certificate.
   * Controlled by OBSIDIAN_VERIFY_SSL env var ('true' or 'false').
   * Default: true
   */
  obsidianVerifySsl: env.OBSIDIAN_VERIFY_SSL,

  // Note: Logger-specific configurations (LOG_FILE_PATH, LOG_MAX_FILES, etc.)
  //       are typically handled directly within the logger utility (src/utils/internal/logger.ts)
};

/**
 * The configured logging level for the application.
 * Exported separately for convenience (e.g., logger initialization).
 * @type {string}
 */
export const logLevel = config.logLevel;

/**
 * The configured runtime environment for the application.
 * Exported separately for convenience.
 * @type {string}
 */
export const environment = config.environment;

// Logger initialization and validation logic should occur at the application entry point (e.g., src/index.ts)
// after configuration is loaded.
