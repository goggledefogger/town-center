# CLAUDE.md - Project Context for AI Agents

This is a living document for AI agents working on this codebase.

## Project Overview

**Agent Activity Bus** - A personal dashboard that tracks AI agent activity across all your GitHub repos. When running agentic development across multiple projects and tools, this helps you remember where you left off and what needs attention.

## Current Architecture

### Data Flow
```
GitHub Push → Webhook → Cloud Function → Firestore → Dashboard (real-time)
                              ↓
                     AI Summarization (on-demand)
```

### Key Principles
1. **GitHub is source of truth** - Commits and PRs, not tool-specific tracking
2. **Store minimal data** - Activity updates, preferences, tokens
3. **AI summarizes on demand** - Using user's own API keys (Anthropic/OpenAI/Google)
4. **Single integration point** - One GitHub webhook covers all repos

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4
- **Backend**: Firebase (Auth, Firestore, Cloud Functions, Hosting)
- **AI**: Multi-provider (Anthropic Claude Haiku, OpenAI GPT-4o-mini, Google Gemini 1.5 Flash)

## Project Structure

```
town-center/
├── src/                    # React frontend
│   ├── features/           # Feature modules (projects, settings, tokens, auth)
│   ├── components/         # Shared UI components
│   ├── contexts/           # React contexts (Auth)
│   ├── lib/                # Firebase config
│   └── types/              # TypeScript types
├── functions/              # Cloud Functions
│   └── src/index.ts        # All endpoints (postUpdate, githubWebhook, summarize)
├── _bmad-output/           # BMAD planning artifacts
│   └── planning-artifacts/ # PRD, architecture, epics
└── firestore.*             # Firestore rules and indexes
```

## Cloud Function Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /githubWebhook?token=xxx` | Receives GitHub push events, creates updates |
| `POST /postUpdate` | Direct API for agents (legacy/manual) |
| `POST /summarize` | AI-generated summaries using user's API keys |

## Firestore Schema

```
users/{uid}/
├── projects/{pid}/
│   ├── name, createdAt, lastActivityAt, aiSummary, summaryGeneratedAt
│   └── workstreams/{wid}/
│       ├── name, status, lastActivityAt, aiSummary, actionTag, workType
│       └── updates/{uid}/
│           └── summary, tool, model, priority, timestamp, isRead,
│               commitBody, filesChanged, commitUrl
├── agentTokens/{tid}/
│   └── token, label, isRevoked, createdAt, lastUsedAt
└── settings/
    ├── preferences (activityPaused)
    └── ai (aiProvider, anthropicKey, openaiKey, googleKey)
```

## Current Implementation Status

### Complete
- [x] Firebase Auth (Google sign-in)
- [x] Token management (create, revoke, list)
- [x] GitHub webhook integration
- [x] Projects/Workstreams/Updates browsing
- [x] Real-time updates via Firestore
- [x] Global pause toggle
- [x] AI provider settings (multi-provider)
- [x] Project detail page with status card
- [x] AI summary generation per branch
- [x] AI-generated action tags (needs_attention, question_pending, review_requested, etc.)
- [x] Branch-level summaries with action indicators
- [x] Auto-generate stale summaries on page load (first 3 projects)
- [x] Bullet-point formatted AI summaries
- [x] Feature-level AI summaries (replacing commit-level summaries)
- [x] workType classification (feature/bugfix/refactor/infrastructure/docs/maintenance)
- [x] Project-level AI summaries on detail page
- [x] Enriched webhook data (commit bodies, file paths, commit URLs)

### In Progress
- [ ] Action tag click-through actions

### Pending
- [ ] Onboarding wizard (Epic 2.4)
- [ ] Dormant work reminders (Epic 4.5)
- [ ] Jump-back links (Epic 5.1)
- [ ] Client-side search (Epic 5.3)

## Key Files to Know

| File | Purpose |
|------|---------|
| `functions/src/index.ts` | All Cloud Function logic |
| `src/features/projects/ProjectDetailPage.tsx` | Main project view |
| `src/features/settings/SettingsPage.tsx` | AI keys and preferences |
| `firestore.rules` | Security rules |
| `_bmad-output/planning-artifacts/epics.md` | Full epic breakdown |

## Testing

- **Frontend**: `npm run dev` (runs on localhost:5173+)
- **Functions**: Deploy to Firebase (no local emulator due to Java requirements)
- **Webhook**: Use `gh api` to create/test webhooks

## Common Tasks

### Add a new Cloud Function endpoint
1. Add to `functions/src/index.ts`
2. `cd functions && npm run build`
3. `firebase deploy --only functions`

### Update Firestore schema
1. Update TypeScript types in `src/types/`
2. Update security rules in `firestore.rules`
3. `firebase deploy --only firestore:rules`

### Configure GitHub webhook for a repo
```bash
gh api repos/OWNER/REPO/hooks --method POST \
  -f name='web' \
  -F active=true \
  -f events[]='push' \
  -f config[url]='https://us-central1-town-center-agent.cloudfunctions.net/githubWebhook?token=YOUR_TOKEN' \
  -f config[content_type]='json'
```

### GitHub App (auto-covers all repos)
Create a GitHub App at https://github.com/settings/apps/new with:
- Webhook URL: `https://us-central1-town-center-agent.cloudfunctions.net/githubWebhook?token=YOUR_TOKEN`
- Permissions: Contents (read), Metadata (read)
- Events: Push
- Install on your account to auto-track all repos

## Recent Changes

- **2026-02-11**: Feature-level AI summaries replacing commit-level summaries
- **2026-02-11**: workType classification pills on branch names (feature/bugfix/refactor/infrastructure/docs/maintenance)
- **2026-02-11**: Project-level AI summary on detail page
- **2026-02-11**: Enriched webhook data from GitHub pushes (commit bodies, file paths, commit URLs)
- **2026-02-04**: Simplified AI summaries to one short human-readable sentence
- **2026-02-04**: Improved spacing/padding on workstream rows for readability
- **2026-02-04**: Added GitHub App support for automatic webhook on all repos
- **2026-02-04**: Auto-generate stale summaries on page load for first 3 projects
- **2026-02-04**: Added AI-generated action tags for at-a-glance workstream triage
- **2026-02-04**: Branch summaries now show action indicators (needs_attention, question_pending, etc.)
- **2026-02-04**: Improved status color scheme (blue=active, slate=paused, emerald=completed)
- **2026-02-04**: Replaced tool-specific hooks with GitHub webhook integration
- **2026-02-04**: Added multi-provider AI summarization (Anthropic/OpenAI/Google)
- **2026-02-04**: Users now configure their own API keys in Settings
