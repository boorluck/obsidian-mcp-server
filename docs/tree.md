# obsidian-mcp-server - Directory Structure

Generated on: 2025-05-03 04:38:23


```
obsidian-mcp-server
├── docs
    ├── obsidian-api
    │   ├── obsidian_rest_api_spec.json
    │   └── obsidian_rest_api_spec.yaml
    ├── obsidian_mcp_tools_spec.md
    └── tree.md
├── scripts
    ├── clean.ts
    ├── fetch-openapi-spec.ts
    ├── make-executable.ts
    └── tree.ts
├── src
    ├── config
    │   └── index.ts
    ├── mcp-server
    │   ├── tools
    │   │   ├── obsidianDeleteFileTool
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── obsidianListFilesTool
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── obsidianReadFileTool
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── obsidianSearchReplaceTool
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   └── obsidianUpdateFileTool
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   ├── transports
    │   │   ├── authentication
    │   │   │   └── authMiddleware.ts
    │   │   ├── httpTransport.ts
    │   │   └── stdioTransport.ts
    │   ├── .DS_Store
    │   └── server.ts
    ├── services
    │   └── obsidianRestAPI
    │   │   ├── methods
    │   │       ├── activeFileMethods.ts
    │   │       ├── commandMethods.ts
    │   │       ├── openMethods.ts
    │   │       ├── patchMethods.ts
    │   │       ├── periodicNoteMethods.ts
    │   │       ├── searchMethods.ts
    │   │       └── vaultMethods.ts
    │   │   ├── index.ts
    │   │   ├── service.ts
    │   │   └── types.ts
    ├── types-global
    │   └── errors.ts
    ├── utils
    │   ├── internal
    │   │   ├── errorHandler.ts
    │   │   ├── index.ts
    │   │   ├── logger.ts
    │   │   └── requestContext.ts
    │   ├── metrics
    │   │   ├── index.ts
    │   │   └── tokenCounter.ts
    │   ├── obsidian
    │   │   ├── index.ts
    │   │   └── obsidianStatUtils.ts
    │   ├── parsing
    │   │   ├── dateParser.ts
    │   │   ├── index.ts
    │   │   └── jsonParser.ts
    │   ├── security
    │   │   ├── idGenerator.ts
    │   │   ├── index.ts
    │   │   ├── rateLimiter.ts
    │   │   └── sanitization.ts
    │   └── index.ts
    ├── .DS_Store
    └── index.ts
├── .clinerules
├── Dockerfile
├── env.json
├── LICENSE
├── mcp-client-config.example.json
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── tsconfig.json
└── typedoc.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
