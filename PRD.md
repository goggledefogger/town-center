# Agent Activity Bus — Product Requirements Document

**Status:** Draft
**Owner:** User
**Last Updated:** 2026-02-03
**BMAD Version:** 6.0

---

## Executive Summary

The Agent Activity Bus is a personal message bus and web dashboard that tracks what your AI development agents are doing across all the tools you use — Cursor, Claude Code, OpenAI Codex, Google Antigravity, and whatever comes next. Think of it as a LinkedIn-style activity feed for your coding agents: short, tweet-length updates about what each agent did, on which project, on which branch, using which model, and when.

The core problem it solves is simple. When you're running agentic development across half a dozen projects and tools simultaneously, it becomes genuinely hard to remember where you left off, what's waiting for your attention, and what you should work on next. This tool answers those questions in under 30 seconds.

It is software-agnostic by design, API-first under the hood, and privacy-conscious throughout. The MVP uses Firebase for storage and auth, runs well locally, and can be accessed securely from anywhere.

---

## Problem Statement

Agentic development fragments your attention across projects, tools, and branches in ways that traditional project management doesn't address. Specifically:

You lose track of which projects you touched recently and which workstreams within them are still active. You forget about branches or features you started last week. You can't quickly tell which tool and model produced the last round of work. When you sit down in the evening to pick up where you left off, there's a real friction cost to figuring out what to work on, where to find it, and how to jump back into the right IDE or agent context.

This isn't about project management or task tracking — at least not yet. It's about having a lightweight, chronological record of agent activity that lets you browse, reorient, and resume.

---

## Success Criteria

### User Success

Time to find your next task should be under 30 seconds when you open the dashboard. At a glance, you should see at least five active projects, each surfacing two or more highlighted workstreams. Priority should be visually obvious through badges, color coding, or grouping — enough to distinguish key work projects from personal experiments without reading anything. On mobile, you should be able to tell at a glance which projects are worth ideating on versus which ones require your Mac and a full IDE.

### Technical Success

Firebase Auth locks access to a single user account with properly configured Firestore security rules. Secrets and environment variables are never exposed client-side. The app runs and tests locally on localhost, works across a home network, and optionally deploys to Firebase Hosting for remote access. Agent updates never include passwords, API keys, or personally identifiable information — this is enforced primarily through the agent prompt templates, with a lightweight local redaction check as a safety net (stronger detection deferred to a later phase).

### Business Success

Not defined for MVP. If it's helpful, that's enough.

---

## Core Concepts

### The Update

The fundamental unit is a short update — roughly tweet-length or GitHub-commit-message-length. Each update captures what an agent did, in a sentence or two, along with structured metadata.

An update includes: a short summary of the work performed, the project name, the workstream or branch, the agent tool used (Cursor, Claude Code, Codex, Antigravity, etc.), the model and model version, a timestamp, and a priority level (high, medium, low, or debug — configurable later).

Updates are meant to be lightweight. No images in the MVP, no long-form content. Just enough to jog your memory and help you decide what to do next.

### Projects and Workstreams

A project maps roughly to a repository or a major initiative. Within a project, there are workstreams — these might correspond to Git branches, feature threads, or just distinct lines of work. The naming is flexible because the relationship between branches and workstreams isn't always one-to-one. Sometimes you're working on the same branch from two different tools. Sometimes a single workstream spans multiple branches.

The feed is browsable at three levels: all projects, a single project's workstreams, and a single workstream's chronological stream of updates.

### Multi-Agent, Multi-Tool

A given workstream may receive updates from multiple agents and multiple tools over time. You might start a feature in Claude Code, continue it in Antigravity, and come back to it in Cursor. The feed should reflect this naturally — each update carries its own tool and model metadata, and the chronological view shows the full history regardless of which agent posted it.

---

## MVP Scope

### Must-Haves

**Web dashboard (desktop and mobile responsive).** A browsable activity feed organized by project and workstream. Each update displays its metadata clearly — project, workstream, tool, model, timestamp, summary. The dashboard answers the question "what should I work on next?" within seconds.

**Unread indicators and attention signals.** When an agent has posted updates you haven't seen, the project or workstream surfaces that visibly — an unread count, a highlight, something that draws your eye. If an agent's last message is waiting for your follow-up and you haven't responded, that should be obvious. This is the inbox-like behavior that keeps things from silently going stale.

**Jump-back support.** Where possible, provide a quick path to reopen the relevant project, branch, or tool context. On desktop, this might be a deep link or a command you can copy. On mobile, it should at least tell you enough to know what you'd be jumping into and whether it requires your Mac.

**Reminders of forgotten work.** Surface projects and workstreams you haven't touched in a while. This can be as simple as a "you haven't visited this in 5 days" note or a separate view that bubbles up dormant but unfinished work.

**Agent onboarding wizard.** When you start a new project or bring a new agent into the system, there should be a quick, low-friction setup flow. This generates the prompt snippet and credentials the agent needs to start posting updates. Speed matters here — if it takes more than a couple minutes to wire up a new agent, the system won't get used.

**Agent authentication.** Agents need their own way to authenticate when posting updates. This is distinct from user authentication. Each agent or agent-session gets a token or key that authorizes it to write to the bus. The system should make it easy to generate, rotate, and revoke these tokens.

**Firebase backend.** Firestore for storing updates, Firebase Auth for user login, Firebase Hosting for optional cloud deployment. Security rules restrict all reads and writes to the authenticated user.

**Client-side search.** A simple filter or search box that works entirely in the browser. No server-side search infrastructure. This is a browsing experience first, with search as a convenience.

### Deferred to Later

**Configurable update intervals and thresholds.** A settings panel where you can control how often agents post, what priority level triggers a post, and similar knobs. For MVP, these are hardcoded or set per-agent in the prompt.

**Project-level intelligence.** Looking into the actual project data — to-do lists, issues, milestones — to suggest what to work on or proactively kick off agent work. This is the vision, but it depends on the message bus working well first.

**Proactive suggestions.** The system recommending features to build or offering to start work with a single click. Requires deeper project integration.

**MCP server.** Exposing the bus as an API that other AI agents can query conversationally. The data model should support this eventually, but the server itself is not MVP.

**Stronger PII detection.** A proper scanning layer that catches sensitive data before it's written. For MVP, the agent prompts handle this.

**Image attachments.** Screenshots or visual diffs attached to updates. Deferred due to bandwidth and storage considerations.

---

## Data Model (Conceptual)

The data model should support the following without overengineering it:

**Projects** have a name, an optional description, a category or tag (work vs. personal, or custom), a creation date, and a last-activity timestamp.

**Workstreams** belong to a project and have a name (often a branch name), a status (active, paused, completed), and a last-activity timestamp.

**Updates** belong to a workstream and carry the summary text, tool name, model name and version, priority level, timestamp, and a read/unread flag.

**Agent tokens** are associated with a user and optionally scoped to a project. They include a creation date, a label, and a revocation flag.

The schema should be flexible enough that adding new fields later doesn't require a migration. Firestore's document model works well for this.

---

## Extensibility

A key design principle is that the system stays useful as the tooling landscape changes. New IDEs, new AI models, new agent frameworks — they should all be able to post to the bus in the same format with minimal integration work. This means the update schema is generic rather than tool-specific, tool and model names are just string fields rather than enums, and the agent onboarding process is simple enough that wiring up a new tool is a matter of minutes, not hours.

---

## User Flows

**Evening reorientation.** You come downstairs after dinner and open the dashboard. You see your five active projects with unread indicators on two of them. One project has a workstream where Claude Code finished a task and is waiting for your review. Another project has a branch you haven't touched in four days. You tap into the first one, see the agent's summary, and click through to reopen the project in your IDE.

**Multi-tool, multi-project workday.** During the day, you're working in Claude Code on one project, Antigravity on another, and have a third project open in Codex. Each agent posts brief updates as it works. You don't look at the dashboard during the day — it's just accumulating context for later. When you do check in, the feed is chronological within each workstream, and you can see the full arc of what happened.

**New project setup.** You start a new side project. You open the dashboard, run through the onboarding wizard, name the project, and get back a prompt snippet and an agent token. You paste the snippet into your IDE's agent configuration, and the agent starts posting updates on its next action.

---

## Functional Requirements

### Dashboard & Feed

**FR-001:** User can view an activity feed displaying updates organized by project and workstream, with each update showing project name, workstream, tool, model, timestamp, and summary.

**FR-002:** User can browse the feed at three levels: all projects, a single project's workstreams, or a single workstream's chronological updates.

**FR-003:** User can see unread indicators (count or highlight) on projects and workstreams with unseen agent updates.

**FR-004:** User can identify work awaiting follow-up through visual signals distinguishing "agent waiting for response" from "work in progress."

### Navigation & Context

**FR-005:** User can access a jump-back path (deep link or copyable command) to reopen the relevant project, branch, or tool context from any update.

**FR-006:** User can view reminders for dormant work, surfacing projects and workstreams untouched for a configurable period (default: 5 days).

### Agent Management

**FR-007:** User can onboard new projects via a setup wizard that generates prompt snippets and agent credentials in under 2 minutes.

**FR-008:** User can generate, rotate, and revoke agent authentication tokens, with each token labeled and scoped to a user (optionally to a project).

### Search & Filter

**FR-009:** User can search and filter updates using a browser-based search box that queries locally loaded data.

---

## Non-Functional Requirements

### Performance

**NFR-001:** Dashboard loads and displays actionable information within 30 seconds of opening, measured from page load to user identifying next task.

**NFR-002:** Dashboard displays at least 5 active projects simultaneously on initial load.

**NFR-003:** Each project surfaces at least 2 highlighted workstreams when workstreams exist.

### Usability

**NFR-004:** Priority levels (high/medium/low/debug) are visually distinguishable without reading text, via badges, color coding, or spatial grouping.

**NFR-005:** On mobile viewports, user can distinguish IDE-required work from mobile-friendly work at a glance.

**NFR-006:** Dashboard is fully functional on desktop and mobile viewports with responsive layout.

### Security

**NFR-007:** Authentication restricts all data access to a single authenticated user via security rules.

**NFR-008:** No secrets, API keys, or environment variables are exposed in client-side code or network responses.

**NFR-009:** Agent updates are validated to exclude passwords, API keys, and PII before storage, enforced via prompt templates with client-side redaction as backup.

### Deployment

**NFR-010:** Application runs fully functional on localhost for local development.

**NFR-011:** Application is accessible across a home network when running locally.

**NFR-012:** Application optionally deploys to cloud hosting with equivalent security controls.

---

## Technical Notes

The architecture is a web app with a backend API. The API should be clean enough that building an MCP server on top of it later is straightforward, but the MVP doesn't need to optimize for that — just don't make choices that would make it painful.

Firebase is the backend for pragmatic reasons: it's fast to set up, handles auth and hosting, and the free tier is generous for a single-user tool. If the data volume grows significantly, migration options should be considered, but that's not an MVP concern.

The frontend should be responsive and functional on both desktop and mobile. No native app needed. A progressive web app approach could be useful for mobile home-screen access but is not required initially.

Local development should work fully on localhost. Home network access is the primary use case. Cloud access via Firebase Hosting is a secondary mode that should be locked down properly.

---

## Open Questions

How should update intervals be determined in the MVP? Options include time-based (every N minutes), event-based (on commit, on task completion), or hybrid. The agent prompt can specify this, but a sensible default is needed.

What's the right granularity for workstreams? Should they be auto-detected from Git branches, manually created, or some mix? Starting with manual creation via the onboarding wizard and agent-reported branch names seems safest.

Should the dashboard support multiple views (feed view, project grid view, inbox view) in the MVP, or is a single feed-first view sufficient to start?

How should "jump back" work across different tools? Deep links work for some IDEs but not others. A fallback of "copy this command to your terminal" may be the most universal approach.
