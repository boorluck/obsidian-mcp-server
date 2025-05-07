# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Enhanced path sanitization logic and reporting in `src/utils/security/sanitization.ts`.
    - Introduced `PathSanitizeOptions` and `SanitizedPathInfo` for clearer control and output.
    - `sanitizePath` now returns `SanitizedPathInfo` with detailed metadata.
    - Improved handling of absolute paths, relative paths, and `rootDir` constraints.
    - Strengthened path traversal detection.
    - Updated JSDoc comments for better clarity.
