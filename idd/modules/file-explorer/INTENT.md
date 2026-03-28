# File Explorer — Skill Detail Files Tab

## Layer 1: Purpose

The Files tab on the skill detail page shows the package's source files in a GitHub/npm-style code browser. Left panel: file tree. Right panel: Monaco Editor (read-only) showing file contents with syntax highlighting, line numbers, and minimap.

Reference: GitHub source view, npm Code tab, VS Code read-only mode.

## Layer 2: Constraints

| Constraint           | Value                                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| Editor               | Monaco Editor via `@monaco-editor/react`, lazy-loaded                                |
| Mode                 | Read-only. No editing capabilities.                                                  |
| Theme                | Match Tank dark mode (VS Code dark theme)                                            |
| Languages            | Auto-detect from file extension (.md, .json, .py, .ts, .js, .yaml, .toml, .txt, .sh) |
| Minimap              | Visible                                                                              |
| Panel height         | Fixed 600px                                                                          |
| Tree default state   | All folders expanded                                                                 |
| Default selection    | SKILL.md (loaded from readme prop, no API call)                                      |
| Bundle impact        | Monaco lazy-loaded — does NOT block initial page render                              |
| File icons           | Lucide icons: `Folder`/`FolderOpen` for dirs, extension-mapped icons for files       |
| Copy button          | In preview header bar, copies raw file content via `useCopyToClipboard` hook         |
| Files served locally | SKILL.md from `readme` prop, skills.json from `manifest` prop                        |
| Files from API       | All other files from `/api/v1/skills/{name}/{version}/files/{path}`                  |
| Changed files        | Only `file-explorer.tsx`. No new components, no new routes.                          |
| New dependency       | `@monaco-editor/react` (+ `monaco-editor` peer dep)                                  |

## Layer 3: Examples

| Input                     | Expected Output                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| User opens Files tab      | Tree shows all files expanded, SKILL.md selected, Monaco shows SKILL.md content                                                  |
| User clicks a .json file  | Monaco switches to JSON language mode, shows file with syntax highlighting                                                       |
| User clicks a .py file    | Monaco shows Python syntax highlighting                                                                                          |
| User clicks a folder node | Folder collapses/expands (toggle)                                                                                                |
| User clicks Copy button   | File content copied to clipboard, button shows "Copied!" for 2s                                                                  |
| Skill has 0 files         | Shows "No files in this package." message (no tree, no editor)                                                                   |
| File API returns error    | Monaco area shows error message, not a crash                                                                                     |
| File is loading           | Loading indicator visible in the preview area                                                                                    |
| Tree shows directories    | Directories sorted before files, then alphabetical within each group                                                             |
| File extension detection  | .md→markdown, .json→json, .py→python, .ts→typescript, .js→javascript, .yaml/.yml→yaml, .sh→shell, .toml→toml, fallback→plaintext |
