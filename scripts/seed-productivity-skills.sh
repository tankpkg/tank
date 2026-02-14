#!/bin/bash
# Seed productivity-focused skills into the Tank registry.
# These complement the existing 12 programming-focused skills with
# practical daily workflow skills for the OpenClaw community.
#
# Usage: bash scripts/seed-productivity-skills.sh
#
# Prerequisites: tank CLI logged in (`tank whoami` to check)

set -euo pipefail

TANK_BIN="/Users/eladbenhaim/.nvm/versions/node/v24.11.0/bin/tank"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "🌱 Seeding productivity skills..."
echo "   Working directory: $WORK_DIR"
echo ""

publish_skill() {
  local name="$1"
  local dir="$WORK_DIR/$name"
  echo "📦 Publishing @tank/$name..."
  (cd "$dir" && "$TANK_BIN" publish 2>&1 | tail -3)
  echo ""
}

# ── 1. Google Docs ───────────────────────────────────────────────────────

SKILL="google-docs"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/google-docs",
  "version": "1.0.0",
  "description": "Create, edit, format, and collaborate on Google Docs via the Google Docs API and Google Drive API.",
  "permissions": {
    "network": {
      "outbound": ["*.googleapis.com", "accounts.google.com", "oauth2.googleapis.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Google Docs

Create, edit, format, and collaborate on Google Docs programmatically.

## Overview

This skill teaches AI agents how to interact with Google Docs through the Google Docs API and Google Drive API. It covers document creation, content manipulation, formatting, real-time collaboration, and export workflows.

## Capabilities

### Document Lifecycle
- Create new documents with titles and initial content
- Clone existing documents as templates
- Move documents between Drive folders
- Export documents to PDF, DOCX, plain text, or HTML
- Archive and delete documents

### Content Manipulation
- Insert, replace, and delete text at specific locations
- Work with headers, footers, and footnotes
- Manage numbered and bulleted lists
- Insert and position inline images
- Create and modify tables (rows, columns, cell content)

### Formatting
- Apply paragraph styles (headings, normal text, title)
- Set character formatting (bold, italic, underline, font, size, color)
- Configure page setup (margins, orientation, page size)
- Apply named styles and custom style presets

### Collaboration
- Share documents with specific users or domains
- Set permission levels (viewer, commenter, editor)
- Read and resolve comments and suggestions
- Track revision history and restore previous versions

## Authentication

This skill requires Google OAuth 2.0 credentials with the following scopes:

- `https://www.googleapis.com/auth/documents` — Full access to Google Docs
- `https://www.googleapis.com/auth/drive.file` — Access to files created by the app

Store credentials securely and never embed them in skill files. Use environment variables or a credential manager.

## Example Usage

```json
{
  "action": "createDocument",
  "title": "Weekly Status Report",
  "content": "## Status Update\n\nProject is on track...",
  "folderId": "1a2b3c4d5e"
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `*.googleapis.com` | Google Docs and Drive API calls |
| Network | `accounts.google.com` | OAuth authentication |
| Filesystem | Read `./**` | Read local files for upload |
| Subprocess | None | Not required |

## Best Practices

1. **Batch updates**: Use `batchUpdate` to combine multiple operations into a single API call
2. **Use document indexes**: The Docs API uses character indexes — always calculate positions carefully
3. **Handle rate limits**: Implement exponential backoff for 429 responses
4. **Template pattern**: Clone a template document instead of building from scratch for consistent formatting
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

# ── 2. Gmail ─────────────────────────────────────────────────────────────

SKILL="gmail"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/gmail",
  "version": "1.0.0",
  "description": "Send, read, search, label, and manage email through the Gmail API with thread-aware operations.",
  "permissions": {
    "network": {
      "outbound": ["*.googleapis.com", "accounts.google.com", "oauth2.googleapis.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Gmail

Send, read, search, label, and manage email through the Gmail API.

## Overview

This skill teaches AI agents to work with Gmail programmatically — composing and sending emails, reading and searching messages, managing labels and filters, and handling attachments. It supports both simple send operations and complex thread-aware workflows.

## Capabilities

### Sending Email
- Compose and send plain text or HTML emails
- Add CC, BCC, and reply-to headers
- Attach files from the local filesystem or URLs
- Send replies and forwards within existing threads
- Schedule sends using Gmail's schedule feature
- Create and send from draft

### Reading & Searching
- Fetch messages by ID with full or metadata-only views
- Search using Gmail's powerful query syntax (`from:`, `to:`, `subject:`, `has:attachment`, `after:`, `before:`, `label:`)
- List messages with pagination support
- Fetch full thread conversations
- Parse MIME messages to extract body, attachments, and headers

### Organization
- Create, update, and delete labels
- Apply and remove labels from messages
- Batch modify labels across multiple messages
- Create filters for automatic label application
- Archive, trash, and permanently delete messages
- Mark messages as read/unread or starred/unstarred

### Drafts
- Create drafts for review before sending
- Update existing draft content
- List and delete drafts

## Authentication

Requires Google OAuth 2.0 with one of these scopes:

- `https://www.googleapis.com/auth/gmail.modify` — Read, send, delete, and manage labels
- `https://www.googleapis.com/auth/gmail.readonly` — Read-only access (for search/read workflows)
- `https://www.googleapis.com/auth/gmail.send` — Send-only access

Use the most restrictive scope that fits your use case.

## Example Usage

```json
{
  "action": "sendEmail",
  "to": ["team@example.com"],
  "subject": "Deploy complete",
  "body": "The v2.1 deployment finished successfully. All health checks passing.",
  "format": "plain"
}
```

```json
{
  "action": "searchMessages",
  "query": "from:alerts@monitoring.io after:2026/02/01 has:attachment",
  "maxResults": 10
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `*.googleapis.com` | Gmail API calls |
| Network | `accounts.google.com` | OAuth authentication |
| Filesystem | Read `./**` | Read local files for attachments |
| Subprocess | None | Not required |

## Best Practices

1. **Use threads**: Always include `threadId` when replying to keep conversations organized
2. **Batch operations**: Use batch endpoints when modifying multiple messages
3. **Partial responses**: Request only the fields you need with the `fields` parameter
4. **Respect rate limits**: Gmail API has per-user and per-project quotas — implement backoff
5. **RFC 2822 compliance**: When constructing raw messages, ensure proper MIME formatting
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

# ── 3. Google Calendar ───────────────────────────────────────────────────

SKILL="google-calendar"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/google-calendar",
  "version": "1.0.0",
  "description": "Create, query, update, and manage Google Calendar events, schedules, and availability.",
  "permissions": {
    "network": {
      "outbound": ["*.googleapis.com", "accounts.google.com", "oauth2.googleapis.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Google Calendar

Create, query, update, and manage Google Calendar events, schedules, and availability.

## Overview

This skill enables AI agents to manage Google Calendar — creating and modifying events, checking free/busy availability, managing multiple calendars, and handling recurring events. Ideal for scheduling automation, meeting coordination, and time management workflows.

## Capabilities

### Event Management
- Create events with title, description, location, start/end times
- Update existing events (time, attendees, description)
- Delete and cancel events with optional notification to attendees
- Move events between calendars
- Set event colors and visibility (public, private, default)

### Scheduling
- Query free/busy information across multiple calendars
- Find available time slots for a group of attendees
- Create events with conferencing (Google Meet auto-generation)
- Set reminders (email, popup) with configurable lead times
- Handle all-day events and multi-day spans

### Recurring Events
- Create recurring events with RRULE patterns (daily, weekly, monthly, yearly)
- Modify single instances or entire series
- Handle exceptions to recurring patterns
- Query instances of a recurring event within a date range

### Calendar Management
- List all calendars for the authenticated user
- Create and delete secondary calendars
- Subscribe to other users' calendars
- Set calendar-level default reminders and notification preferences
- Manage calendar access control lists (ACLs)

### Attendees & RSVPs
- Add and remove attendees from events
- Set optional vs. required attendance
- Read attendee response status (accepted, declined, tentative)
- Send update notifications to attendees on changes

## Authentication

Requires Google OAuth 2.0:

- `https://www.googleapis.com/auth/calendar` — Full calendar access
- `https://www.googleapis.com/auth/calendar.events` — Event-only access
- `https://www.googleapis.com/auth/calendar.readonly` — Read-only access

## Example Usage

```json
{
  "action": "createEvent",
  "calendarId": "primary",
  "summary": "Sprint Planning",
  "start": "2026-02-17T10:00:00-08:00",
  "end": "2026-02-17T11:00:00-08:00",
  "attendees": ["alice@example.com", "bob@example.com"],
  "conferenceData": true,
  "reminders": [{"method": "popup", "minutes": 10}]
}
```

```json
{
  "action": "findAvailability",
  "attendees": ["alice@example.com", "bob@example.com"],
  "timeMin": "2026-02-17T08:00:00-08:00",
  "timeMax": "2026-02-17T18:00:00-08:00",
  "duration": 30
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `*.googleapis.com` | Calendar API calls |
| Network | `accounts.google.com` | OAuth authentication |
| Filesystem | Read `./**` | Read ICS files for import |
| Subprocess | None | Not required |

## Best Practices

1. **Use RFC 3339 timestamps**: Always include timezone offset or use UTC
2. **Batch requests**: Combine multiple operations when creating/updating several events
3. **Incremental sync**: Use `syncToken` from list responses to efficiently poll for changes
4. **Time zone awareness**: Set `timeZone` on events explicitly — don't rely on calendar defaults
5. **Respect quotas**: Calendar API has per-user rate limits — implement exponential backoff
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

# ── 4. Notion ────────────────────────────────────────────────────────────

SKILL="notion"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/notion",
  "version": "1.0.0",
  "description": "Query, create, and update Notion pages, databases, and blocks through the Notion API.",
  "permissions": {
    "network": {
      "outbound": ["api.notion.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Notion

Query, create, and update Notion pages, databases, and blocks through the Notion API.

## Overview

This skill teaches AI agents to interact with Notion workspaces — creating and querying databases, building pages with rich content blocks, managing properties, and automating workspace organization. Supports both internal integrations and OAuth-based public integrations.

## Capabilities

### Database Operations
- Create databases with typed properties (title, text, number, select, multi-select, date, person, files, checkbox, URL, email, phone, formula, relation, rollup, status)
- Query databases with filters and sorts
- Compound filters with `and`/`or` logic
- Paginate through large result sets
- Update database properties and schema

### Page Operations
- Create pages within databases or as standalone pages
- Update page properties (all property types supported)
- Archive and restore pages
- Retrieve page content as block trees
- Set page icons (emoji or external URL) and cover images

### Block Operations
- Append child blocks to pages or other blocks
- Supported block types: paragraph, headings (1-3), bulleted list, numbered list, to-do, toggle, code, quote, callout, divider, table of contents, bookmark, image, embed, file, PDF, table, column list
- Update existing block content
- Delete blocks
- Retrieve block children with pagination

### Search & Discovery
- Search across entire workspace by title
- Filter search by object type (page or database)
- Sort by relevance or last edited time

## Authentication

Notion uses bearer token authentication:

- **Internal integrations**: Use the integration token directly
- **Public integrations**: Use OAuth 2.0 flow to obtain access tokens

Set the `Authorization: Bearer <token>` header and `Notion-Version: 2022-06-28` header on all requests.

## Example Usage

```json
{
  "action": "queryDatabase",
  "databaseId": "abc123",
  "filter": {
    "property": "Status",
    "status": { "equals": "In Progress" }
  },
  "sorts": [
    { "property": "Priority", "direction": "ascending" }
  ]
}
```

```json
{
  "action": "createPage",
  "parentDatabaseId": "abc123",
  "properties": {
    "Name": "Implement auth flow",
    "Status": "To Do",
    "Priority": "High",
    "Assignee": "alice@example.com"
  },
  "content": [
    { "type": "heading_2", "text": "Requirements" },
    { "type": "bulleted_list_item", "text": "Support OAuth 2.0" },
    { "type": "bulleted_list_item", "text": "Add rate limiting" }
  ]
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `api.notion.com` | Notion API calls |
| Filesystem | Read `./**` | Read local files for page content |
| Subprocess | None | Not required |

## Best Practices

1. **Paginate everything**: All list endpoints return max 100 results — always check `has_more` and use `start_cursor`
2. **Respect rate limits**: Notion enforces ~3 requests/second per integration — use backoff on 429
3. **Use the block tree**: Pages are trees of blocks, not flat documents — build content hierarchically
4. **Property type matching**: When setting property values, match the exact type schema (e.g., `rich_text` not plain string)
5. **Notion-Version header**: Always include it — API behavior changes between versions
6. **Batch appends**: Append up to 100 child blocks in a single request instead of one at a time
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

# ── 5. Slack ─────────────────────────────────────────────────────────────

SKILL="slack"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/slack",
  "version": "1.0.0",
  "description": "Send messages, manage channels, search conversations, and automate workflows in Slack via the Web API.",
  "permissions": {
    "network": {
      "outbound": ["slack.com", "*.slack.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Slack

Send messages, manage channels, search conversations, and automate workflows in Slack.

## Overview

This skill teaches AI agents to interact with Slack workspaces through the Slack Web API. It covers messaging, channel management, user lookups, file uploads, search, and Block Kit for rich message formatting. Essential for build notifications, incident response, team communication automation, and workflow integrations.

## Capabilities

### Messaging
- Send messages to channels, DMs, and group conversations
- Reply in threads to keep conversations organized
- Update and delete existing messages
- Schedule messages for future delivery
- Send ephemeral messages visible only to a specific user
- React to messages with emoji

### Rich Formatting (Block Kit)
- Compose messages with sections, headers, dividers, context blocks
- Add interactive elements: buttons, select menus, date pickers, overflow menus
- Build modal dialogs and home tab views
- Attach images, files, and links with rich previews
- Use `mrkdwn` formatting (bold, italic, strikethrough, code, links, mentions)

### Channel Management
- Create, archive, and unarchive channels
- Set channel topic and purpose
- Invite and remove users from channels
- List channels with pagination and filtering
- Get channel history and conversation info

### Search & Discovery
- Search messages across the workspace
- Search files by name, type, and content
- List users and find users by email
- Get user profile information and presence status

### File Operations
- Upload files to channels or DMs
- Share existing files to new channels
- List and delete files
- Get file download URLs

## Authentication

Slack uses OAuth 2.0 Bot Tokens or User Tokens:

- **Bot Token** (`xoxb-`): For app/bot actions (sending messages, managing channels)
- **User Token** (`xoxp-`): For actions on behalf of a user (search, user-level operations)

Required scopes depend on actions — common ones include `chat:write`, `channels:read`, `channels:manage`, `files:write`, `search:read`, `users:read`.

## Example Usage

```json
{
  "action": "sendMessage",
  "channel": "#deployments",
  "text": "✅ Deploy v2.1.0 to production complete",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deploy v2.1.0* to `production` complete ✅\n• 0 errors in health checks\n• Response time: 42ms p95"
      }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "View Logs" }, "url": "https://logs.example.com/deploy/v2.1.0" }
      ]
    }
  ]
}
```

```json
{
  "action": "searchMessages",
  "query": "from:@alertbot has:link after:2026-02-01",
  "count": 20
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `slack.com` | Slack Web API calls |
| Network | `*.slack.com` | Workspace-specific endpoints and file uploads |
| Filesystem | Read `./**` | Read local files for upload |
| Subprocess | None | Not required |

## Best Practices

1. **Use Block Kit**: Rich messages get better engagement and readability than plain text
2. **Thread replies**: Always use `thread_ts` for follow-up messages to avoid channel noise
3. **Rate limits**: Slack uses tiered rate limiting (1-100+ req/min per method) — implement backoff
4. **Unfurl control**: Set `unfurl_links` and `unfurl_media` explicitly to control link previews
5. **Ephemeral for errors**: Use ephemeral messages for error feedback so only the relevant user sees it
6. **Pagination**: Use cursor-based pagination (`cursor` + `limit`) — never rely on offset
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

# ── 6. Google Sheets ─────────────────────────────────────────────────────

SKILL="google-sheets"
mkdir -p "$WORK_DIR/$SKILL"

cat > "$WORK_DIR/$SKILL/skills.json" << 'ENDJSON'
{
  "name": "@tank/google-sheets",
  "version": "1.0.0",
  "description": "Read, write, format, and analyze spreadsheet data through the Google Sheets API.",
  "permissions": {
    "network": {
      "outbound": ["*.googleapis.com", "accounts.google.com", "oauth2.googleapis.com"]
    },
    "filesystem": {
      "read": ["./**"]
    },
    "subprocess": false
  }
}
ENDJSON

cat > "$WORK_DIR/$SKILL/SKILL.md" << 'ENDMD'
# Google Sheets

Read, write, format, and analyze spreadsheet data through the Google Sheets API.

## Overview

This skill teaches AI agents to work with Google Sheets — reading and writing cell data, formatting, creating charts, managing named ranges, and using formulas. It supports both simple value operations and complex batch updates for high-performance data manipulation.

## Capabilities

### Reading Data
- Read single cells, ranges, and multiple ranges in one call
- Get values with formatting metadata (number format, colors, fonts)
- Read entire sheets or specific named ranges
- Choose value render options: `FORMATTED_VALUE`, `UNFORMATTED_VALUE`, `FORMULA`
- Get sheet properties (title, grid size, frozen rows/columns)

### Writing Data
- Write to single cells or ranges
- Append rows to the end of a table (auto-detect range)
- Batch update multiple ranges in a single request
- Choose input options: `RAW` (literal values) or `USER_ENTERED` (parse as if typed)
- Clear cell values and formatting

### Formatting
- Set cell background colors, font styles, sizes, and colors
- Apply number formats (currency, percentage, dates, custom patterns)
- Set borders on cell ranges
- Merge and unmerge cells
- Set horizontal and vertical alignment
- Apply conditional formatting rules (color scales, data bars, custom formulas)
- Set data validation rules (dropdowns, number ranges, custom criteria)

### Sheet Management
- Create, rename, delete, and reorder sheets within a spreadsheet
- Copy sheets between spreadsheets
- Freeze and unfreeze rows and columns
- Hide and show rows, columns, and sheets
- Set sheet-level protection

### Charts & Visualization
- Create embedded charts (bar, line, pie, scatter, area, combo)
- Configure chart titles, legends, axes, and data ranges
- Update and delete charts
- Move charts between sheets

### Advanced Operations
- Create and manage named ranges
- Use developer metadata for programmatic access
- Add and manage filters and filter views
- Sort and auto-resize columns
- Find and replace across sheets

## Authentication

Requires Google OAuth 2.0:

- `https://www.googleapis.com/auth/spreadsheets` — Full read/write access
- `https://www.googleapis.com/auth/spreadsheets.readonly` — Read-only access

## Example Usage

```json
{
  "action": "readRange",
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "range": "Sheet1!A1:D10",
  "valueRenderOption": "FORMATTED_VALUE"
}
```

```json
{
  "action": "appendRows",
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "range": "Sheet1!A:D",
  "values": [
    ["2026-02-14", "Deploy v2.1", "Success", "42ms"],
    ["2026-02-14", "Run tests", "Success", "3.2s"]
  ],
  "valueInputOption": "USER_ENTERED"
}
```

## Permissions

| Permission | Scope | Reason |
|-----------|-------|--------|
| Network | `*.googleapis.com` | Sheets API calls |
| Network | `accounts.google.com` | OAuth authentication |
| Filesystem | Read `./**` | Read local CSV/data files for upload |
| Subprocess | None | Not required |

## Best Practices

1. **Use A1 notation**: Ranges use `SheetName!A1:B10` format — quote sheet names with spaces
2. **Batch operations**: Use `batchUpdate` and `batchGet` to minimize API calls
3. **USER_ENTERED for formulas**: Use `valueInputOption: "USER_ENTERED"` when writing formulas or dates
4. **Append, don't overwrite**: Use `spreadsheets.values.append` for adding rows — it auto-detects the table boundary
5. **Rate limits**: 300 requests per minute per project — batch where possible
6. **Named ranges**: Use named ranges instead of hardcoded A1 references for maintainability
ENDMD

cat > "$WORK_DIR/$SKILL/LICENSE" << 'ENDLIC'
MIT License

Copyright (c) 2026 Tank Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
ENDLIC

publish_skill "$SKILL"

echo "════════════════════════════════════════════"
echo "✅ All 6 productivity skills published!"
echo "════════════════════════════════════════════"
echo ""
echo "Verify with: tank search google"
echo "  or visit: http://localhost:3000/skills"
