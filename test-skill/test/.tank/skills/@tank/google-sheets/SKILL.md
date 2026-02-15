# Google Sheets

Read, write, format, and analyze spreadsheet data through the Google Sheets API.

## Overview

This skill teaches AI agents to work with Google Sheets — reading and writing cell data, formatting, creating charts, managing named ranges, and using formulas. Supports both simple value operations and complex batch updates.

## Capabilities

### Reading Data
- Read single cells, ranges, and multiple ranges in one call
- Get values with formatting metadata
- Read entire sheets or named ranges
- Choose value render options: FORMATTED_VALUE, UNFORMATTED_VALUE, FORMULA

### Writing Data
- Write to single cells or ranges
- Append rows to the end of a table
- Batch update multiple ranges in a single request
- Choose input options: RAW or USER_ENTERED

### Formatting
- Set cell background colors, font styles, sizes, and colors
- Apply number formats (currency, percentage, dates, custom)
- Set borders, merge cells, alignment
- Apply conditional formatting rules and data validation

### Sheet Management
- Create, rename, delete, and reorder sheets
- Copy sheets between spreadsheets
- Freeze rows and columns, hide/show elements
- Set sheet-level protection

### Charts & Visualization
- Create embedded charts (bar, line, pie, scatter, area, combo)
- Configure chart titles, legends, axes, and data ranges

## Authentication

Requires Google OAuth 2.0 with `spreadsheets` or `spreadsheets.readonly` scope.

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `*.googleapis.com` | Sheets API calls |
| Network | `accounts.google.com` | OAuth authentication |
| Filesystem | Read `./**` | Read local CSV/data files |
| Subprocess | None | Not required |

## Best Practices

1. **Use A1 notation** for ranges — quote sheet names with spaces
2. **Batch operations** to minimize API calls
3. **USER_ENTERED** for formulas and dates
4. **Append, don't overwrite** — use `values.append` for adding rows
5. **Named ranges** instead of hardcoded A1 references
