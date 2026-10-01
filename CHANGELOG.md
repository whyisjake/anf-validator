# Changelog

## [0.1.0] - 2026-05-27

### Added
- Initial release
- Validates `article.json` files against the Apple News Format (ANF) specification
- JSON Schema validation with actionable error messages
- Cross-reference validation for component text styles, layouts, and inline styles
- Diagnostics surfaced in VS Code's Problems panel
- Re-validation when `article.json` changes on disk from any source
- URL reachability checks for image and media URLs (`anfValidator.checkUrls`)
