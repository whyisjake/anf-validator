# ANF Validator

A VS Code extension that validates `article.json` files against the [Apple News Format (ANF)](https://developer.apple.com/documentation/apple_news/apple_news_format) specification.

---

## Features

- **JSON Schema validation** — checks required fields (`version`, `identifier`, `title`, `language`, `layout`, `components`, `componentTextStyles`), field types, and ANF-specific patterns
- **Cross-reference validation** — detects dangling `textStyle`, `layout`, and `style` references in components that point to missing entries in root dictionaries
- **Actionable diagnostics** — every error appears in the VS Code Problems panel with a human-readable description and a fix suggestion
- **Validates on open and save** — diagnostics update automatically when you open or save an `article.json` file

---

## Requirements

- VS Code 1.90 or later
- A workspace (folder) containing one or more `article.json` files

---

## Usage

1. Open a folder containing an `article.json` in VS Code.
2. Open or save the file — the extension activates automatically.
3. Check the **Problems** panel (`View → Problems`) for validation errors.

---

## ANF Schema Coverage

The bundled schema covers ANF 1.26.0 and validates:

| Area | What's checked |
|---|---|
| Required root fields | `version`, `identifier`, `title`, `language`, `layout`, `components`, `componentTextStyles` |
| `version` format | Must match `major.minor` (e.g. `"1.26"`) |
| `identifier` format | 1–64 characters: letters, digits, hyphens, underscores |
| `language` format | BCP 47 (e.g. `"en"`, `"en-US"`) |
| `layout` | Requires `columns` (integer) and `width` (positive number) |
| `components` | Array with at least one item; each item requires `role` |
| Component `role` | Validated against known ANF roles (unknown future roles produce a warning) |
| Cross-references | `textStyle`, `layout`, and `style` string refs validated against root dictionaries |

---

## Extension Settings

This extension has no configurable settings.

---

## Known Issues

- The bundled ANF JSON Schema covers the most common fields and component types. Properties not explicitly listed are allowed (`additionalProperties: true` for components). If you encounter a false positive for a valid ANF property, please [open an issue](https://github.com/whyisjake/anf-validator/issues).
- Validation runs on open and save only — live typing does not trigger re-validation.

---

## Release Notes

### 0.1.0 — Initial Release

- JSON Schema validation for ANF `article.json` files
- Cross-reference validation for `textStyle`, `layout`, and `style` refs
- Diagnostics in the VS Code Problems panel

---

## Development

```bash
git clone https://github.com/whyisjake/anf-validator
cd anf-validator
npm install
npm run build   # one-shot build
npm run watch   # watch mode
npm test        # unit tests (Vitest)
npm run typecheck  # TypeScript type-check only
```

To launch the extension in a VS Code Extension Host for manual testing:

1. Open the project folder in VS Code
2. Press **F5** (Run Extension)
3. In the new window, open a folder containing an `article.json`

---

## License

MIT
