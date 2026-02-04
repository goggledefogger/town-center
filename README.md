# Agent Activity Bus

A personal message bus and web dashboard that tracks what your AI development agents are doing across all the tools you use.

## Overview

When you're running agentic development across multiple projects and tools simultaneously, it becomes hard to remember where you left off, what's waiting for your attention, and what you should work on next. This tool answers those questions in under 30 seconds.

## Features (MVP)

- **Activity Feed** - LinkedIn-style chronological updates from all your AI agents
- **Multi-Tool Support** - Works with Cursor, Claude Code, OpenAI Codex, Google Antigravity, and more
- **Project & Workstream Organization** - Browse by project, branch, or feature thread
- **Unread Indicators** - Know what needs your attention at a glance
- **Jump-Back Links** - Quick path to reopen the relevant context in your IDE
- **Mobile Responsive** - Check status from anywhere

## Tech Stack

- React 19 + TypeScript + Vite
- Firebase (Auth, Firestore, Cloud Functions, Hosting)
- TailwindCSS 4

## Quick Start

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. Create `.env.local` with your Firebase config:
   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_USE_EMULATORS=false
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

### Deploy

```bash
firebase deploy
```

## Data Model

The activity bus organizes updates hierarchically:

```
User
└── Projects (auto-created from update payloads)
    └── Workstreams (branches, features, or task threads)
        └── Updates (individual agent activity entries)
```

**Key concepts:**
- **Project**: Usually maps to a repository or codebase (e.g., `my-app`, `backend-api`)
- **Workstream**: A thread of related work - typically a git branch, feature name, or task (e.g., `feature-auth`, `fix-login-bug`, `main`)
- **Update**: A single activity entry describing what was done

Projects and workstreams are auto-created when updates reference them.

## Agent API

Post updates from your AI agents using the REST endpoint.

### Endpoint

```
POST https://us-central1-YOUR_PROJECT.cloudfunctions.net/postUpdate
```

### Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Agent-Token` | Your agent token (create in dashboard) |

### Request Body

```json
{
  "project": "my-project",
  "workstream": "feature-auth",
  "summary": "Implemented login flow with Google OAuth - added LoginPage component, configured Firebase Auth provider, and set up protected routes",
  "tool": "claude-code",
  "model": "claude-sonnet-4",
  "priority": "medium"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `project` | Yes | Project/repo name (auto-created if new) |
| `workstream` | Yes | Branch, feature, or task name |
| `summary` | Yes | **Descriptive summary of what was done and why** |
| `tool` | Yes | Tool name (see below) |
| `model` | Yes | Model used (claude-sonnet-4, gpt-4, etc.) |
| `modelVersion` | No | Specific model version |
| `priority` | No | `high`, `medium`, `low`, or `debug` (default: `medium`) |

### Writing Good Summaries

The `summary` field is the most important - it should answer "what was accomplished and why?"

**Good summaries:**
- "Implemented user authentication with Google OAuth - added login page, auth context, and route guards"
- "Fixed pagination bug in user list - issue was off-by-one error in offset calculation"
- "Refactored API client to use async/await - improved error handling and reduced callback nesting"

**Bad summaries:**
- "Used: Bash, Edit, Read, Write" (just lists tools, not what was done)
- "Modified files" (no context)
- "Session activity" (meaningless)

### Tool Identifiers

Use consistent tool names for filtering and analytics:

| Tool | Identifier |
|------|------------|
| Claude Code | `claude-code` |
| Cursor | `cursor` |
| GitHub Copilot | `copilot` |
| Windsurf | `windsurf` |
| Aider | `aider` |
| Continue | `continue` |
| Custom/Other | Use descriptive lowercase name |

### Example

```bash
curl -X POST https://us-central1-town-center-agent.cloudfunctions.net/postUpdate \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: YOUR_TOKEN" \
  -d '{
    "project": "my-app",
    "workstream": "feature-auth",
    "summary": "Added password reset functionality",
    "tool": "claude-code",
    "model": "claude-sonnet-4"
  }'
```

### Response

Success:
```json
{
  "success": true,
  "data": {
    "updateId": "abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Token is invalid or has been revoked"
  }
}
```

## Claude Code Integration

Automatically post updates from Claude Code using hooks.

### Setup

1. Create the hook script at `~/.claude/hooks/post-activity.sh`:

```bash
#!/bin/bash
# Post Claude Code activity to Agent Activity Bus

AGENT_TOKEN="${AGENT_ACTIVITY_TOKEN:-}"
API_URL="https://us-central1-town-center-agent.cloudfunctions.net/postUpdate"

if [ -z "$AGENT_TOKEN" ]; then
  exit 0
fi

INPUT=$(cat)

# Prevent infinite loops
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
PROJECT_DIR="${CWD:-$(pwd)}"
PROJECT_NAME=$(basename "$PROJECT_DIR")
WORKSTREAM=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

SUMMARY="Session activity"
PRIORITY="low"
TOOL_COUNT=0

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  TOOL_COUNT=$(tail -50 "$TRANSCRIPT_PATH" | grep -c '"type":"tool_use"' 2>/dev/null || echo "0")
  FILES_MODIFIED=$(tail -100 "$TRANSCRIPT_PATH" | \
    grep -o '"file_path":"[^"]*"' | \
    sed 's/"file_path":"//g; s/"//g' | \
    xargs -I{} basename {} 2>/dev/null | \
    sort -u | head -5 | tr '\n' ', ' | sed 's/,$//')

  if [ -n "$FILES_MODIFIED" ]; then
    SUMMARY="Modified: $FILES_MODIFIED"
  fi
fi

if [ "$TOOL_COUNT" -gt 5 ] 2>/dev/null; then PRIORITY="medium"; fi
if [ "$TOOL_COUNT" -gt 15 ] 2>/dev/null; then PRIORITY="high"; fi
if [ "$TOOL_COUNT" -lt 1 ] 2>/dev/null; then exit 0; fi

curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: $AGENT_TOKEN" \
  -d "{
    \"project\": \"$PROJECT_NAME\",
    \"workstream\": \"$WORKSTREAM\",
    \"summary\": \"$SUMMARY\",
    \"tool\": \"claude-code\",
    \"model\": \"claude-sonnet-4\",
    \"priority\": \"$PRIORITY\"
  }" > /dev/null 2>&1 &

exit 0
```

2. Make it executable:
```bash
chmod +x ~/.claude/hooks/post-activity.sh
```

3. Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/post-activity.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

4. Set your token in `~/.bashrc` or `~/.zshrc`:
```bash
export AGENT_ACTIVITY_TOKEN="your-token-here"
```

The hook fires after each Claude response, extracting the user's task/request from the transcript to create meaningful summaries.

## Integrating Other AI Tools

The API is tool-agnostic. Here's how to integrate other AI coding assistants:

### Cursor

Add a post-session script or use Cursor's extension API to POST updates:

```javascript
// Example: Post from a Cursor extension
const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Agent-Token': process.env.AGENT_ACTIVITY_TOKEN
  },
  body: JSON.stringify({
    project: workspaceName,
    workstream: gitBranch,
    summary: `${userRequest} - ${filesChanged.join(', ')}`,
    tool: 'cursor',
    model: 'gpt-4',
    priority: 'medium'
  })
});
```

### Aider

Add to your `.aider.conf.yml` or wrap aider with a script:

```bash
#!/bin/bash
# aider-wrapper.sh - Run aider and post activity
aider "$@"
EXIT_CODE=$?

# Post summary after aider session
if [ $EXIT_CODE -eq 0 ]; then
  curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Token: $AGENT_ACTIVITY_TOKEN" \
    -d "{
      \"project\": \"$(basename $(pwd))\",
      \"workstream\": \"$(git branch --show-current)\",
      \"summary\": \"Aider session completed\",
      \"tool\": \"aider\",
      \"model\": \"claude-sonnet-4\"
    }"
fi
```

### Custom Integration Pattern

For any tool, the integration pattern is:

1. **Capture context**: Project name (usually directory), workstream (usually git branch)
2. **Extract the task**: What did the user ask for? This becomes the summary.
3. **Note what changed**: Files modified, features added, bugs fixed
4. **POST to the API**: Send structured update with meaningful summary

### Summary Best Practices

The quality of your dashboard depends on summary quality:

| Approach | Example |
|----------|---------|
| **Task-first** | "Add user authentication - implemented Google OAuth with Firebase" |
| **Change-first** | "Refactored API client to use async/await for better error handling" |
| **Fix-first** | "Fixed pagination bug - off-by-one error in offset calculation" |

Include the **why** (user's goal) and **what** (changes made) in each summary.

## License

MIT
