# obsidian-mcp-server - Directory Structure

Generated on: 2025-05-02 19:19:25


```
obsidian-mcp-server
├── docs
    ├── obsidian-api
    │   ├── obsidian_rest_api_spec.json
    │   └── obsidian_rest_api_spec.yaml
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
    │   ├── resources
    │   │   └── echoResource
    │   │   │   ├── echoResourceLogic.ts
    │   │   │   ├── index.ts
    │   │   │   └── registration.ts
    │   ├── tools
    │   │   └── echoTool
    │   │   │   ├── echoToolLogic.ts
    │   │   │   ├── index.ts
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
├── debug.js
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
