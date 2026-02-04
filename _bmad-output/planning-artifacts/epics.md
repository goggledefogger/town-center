---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-02-03'
inputDocuments: ['PRD.md', 'architecture.md']
workflowType: 'epics'
project_name: 'town-center'
user_name: 'Roy'
date: '2026-02-03'
implementationStatus:
  epic1: complete
  epic2: partial  # Stories 2.1-2.3 done, 2.4 (onboarding wizard) pending
  epic3: partial  # Stories 3.1-3.4 done, 3.5 (animations) pending
  epic4: not-started
  epic5: not-started
lastImplementationUpdate: '2026-02-04'
---

# town-center - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Agent Activity Bus (town-center), decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Dashboard & Feed**
- FR-001: User can view an activity feed displaying updates organized by project and workstream, with each update showing project name, workstream, tool, model, timestamp, and summary.
- FR-002: User can browse the feed at three levels: all projects, a single project's workstreams, or a single workstream's chronological updates.
- FR-003: User can see unread indicators (count or highlight) on projects and workstreams with unseen agent updates.
- FR-004: User can identify work awaiting follow-up through visual signals distinguishing "agent waiting for response" from "work in progress."

**Navigation & Context**
- FR-005: User can access a jump-back path (deep link or copyable command) to reopen the relevant project, branch, or tool context from any update.
- FR-006: User can view reminders for dormant work, surfacing projects and workstreams untouched for a configurable period (default: 5 days).

**Agent Management**
- FR-007: User can onboard new projects via a setup wizard that generates prompt snippets and agent credentials in under 2 minutes.
- FR-008: User can generate, rotate, and revoke agent authentication tokens, with each token labeled and scoped to a user (optionally to a project).

**Search & Filter**
- FR-009: User can search and filter updates using a browser-based search box that queries locally loaded data.

### NonFunctional Requirements

**Performance**
- NFR-001: Dashboard loads and displays actionable information within 30 seconds of opening, measured from page load to user identifying next task.
- NFR-002: Dashboard displays at least 5 active projects simultaneously on initial load.
- NFR-003: Each project surfaces at least 2 highlighted workstreams when workstreams exist.

**Usability**
- NFR-004: Priority levels (high/medium/low/debug) are visually distinguishable without reading text, via badges, color coding, or spatial grouping.
- NFR-005: On mobile viewports, user can distinguish IDE-required work from mobile-friendly work at a glance.
- NFR-006: Dashboard is fully functional on desktop and mobile viewports with responsive layout.

**Security**
- NFR-007: Authentication restricts all data access to a single authenticated user via security rules.
- NFR-008: No secrets, API keys, or environment variables are exposed in client-side code or network responses.
- NFR-009: Agent updates are validated to exclude passwords, API keys, and PII before storage, enforced via prompt templates with client-side redaction as backup.

**Deployment**
- NFR-010: Application runs fully functional on localhost for local development.
- NFR-011: Application is accessible across a home network when running locally.
- NFR-012: Application optionally deploys to cloud hosting with equivalent security controls.

### Additional Requirements

**From Architecture - Starter Template (MUST be Epic 1, Story 1):**
- Initialize project using Vite + React + TypeScript starter
- Install Firebase, React Router, TailwindCSS dependencies
- Configure Firebase project with Emulators

**From Architecture - Infrastructure:**
- Set up Firestore with nested subcollections schema (`/users/{uid}/projects/{pid}/workstreams/{wid}/updates/{uid}`)
- Configure Firestore security rules for single-user access
- Create Cloud Function HTTP endpoint for agent updates (`POST /postUpdate`)
- Implement agent token validation in Cloud Function
- Set up GitHub Actions CI/CD for automated deployment

**From Architecture - Frontend:**
- Implement React Context structure (AuthContext, DataContext, UIContext)
- Use Firestore onSnapshot for real-time updates
- Follow feature-based folder structure as defined in architecture
- Implement responsive design using TailwindCSS mobile-first approach

**From Architecture - Testing:**
- Set up Vitest for unit testing
- Configure React Testing Library for component tests
- Use Firebase Emulators for local development testing

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR-001 | Epic 3 | Activity feed display |
| FR-002 | Epic 3 | Three-level browse |
| FR-003 | Epic 4 | Unread indicators |
| FR-004 | Epic 4 | Work awaiting follow-up |
| FR-005 | Epic 5 | Jump-back paths |
| FR-006 | Epic 4 | Dormant work reminders |
| FR-007 | Epic 2 | Onboarding wizard |
| FR-008 | Epic 2 | Token management |
| FR-009 | Epic 5 | Client-side search |

## Epic List

### Epic 1: Foundation & Authentication
User can access their secured personal dashboard.
- Initialize project with Vite + React + TypeScript (Architecture requirement)
- Firebase configuration (Auth, Firestore, Functions, Emulators)
- User authentication (login/logout)
- Basic dashboard shell with routing
**FRs covered:** Infrastructure (enables all FRs)
**NFRs addressed:** NFR-007, NFR-010, NFR-011

### Epic 2: Agent Integration & Token Management
User can connect AI agents to post updates to the dashboard.
- Agent token generation, rotation, revocation
- Onboarding wizard for new projects
- Cloud Function HTTP endpoint for agent updates
- Token validation logic
**FRs covered:** FR-007, FR-008

### Epic 3: Activity Feed & Browsing
User can browse all agent activity organized by project and workstream.
- Activity feed display with update metadata
- Three-level browse: all projects → workstreams → updates
- Real-time updates via Firestore onSnapshot
- Responsive layout for desktop/mobile
**FRs covered:** FR-001, FR-002
**NFRs addressed:** NFR-006

### Epic 4: Attention & Status Tracking
User knows exactly what needs their attention right now.
- Unread indicators on projects/workstreams
- Visual signals for work awaiting follow-up
- Dormant work reminders after 5 days
- Priority badges with color coding
**FRs covered:** FR-003, FR-004, FR-006
**NFRs addressed:** NFR-004

### Epic 5: Navigation & Search
User can quickly find and return to any work.
- Jump-back paths to reopen context
- Client-side search/filter
- Mobile distinction for IDE-required work
**FRs covered:** FR-005, FR-009
**NFRs addressed:** NFR-005

---

## Epic 1: Foundation & Authentication

**Status: COMPLETE**

User can access their secured personal dashboard.

### Story 1.1: Initialize Project with Vite + React + TypeScript

As a developer,
I want the project initialized with Vite, React, and TypeScript,
So that I have a working foundation to build the dashboard.

**Acceptance Criteria:**

**Given** a new project directory
**When** the initialization commands are run
**Then** the project builds successfully with `npm run build`
**And** the dev server starts with `npm run dev`
**And** TypeScript strict mode is enabled
**And** TailwindCSS is configured and working
**And** the project structure matches the Architecture document

### Story 1.2: Configure Firebase Project and Emulators

As a developer,
I want Firebase configured with local emulators,
So that I can develop and test without affecting production.

**Acceptance Criteria:**

**Given** the initialized project
**When** Firebase is configured
**Then** Firebase emulators start with `npm run emulators`
**And** Auth, Firestore, and Functions emulators are available
**And** environment variables are properly configured in .env.local
**And** firebase.json and .firebaserc are properly configured
**And** Firestore security rules file exists

### Story 1.3: Implement User Authentication

As a user,
I want to log in with my Google account,
So that my dashboard data is secured and private.

**Acceptance Criteria:**

**Given** the dashboard is loaded
**When** I am not authenticated
**Then** I see a login page with a "Sign in with Google" button

**Given** I click "Sign in with Google"
**When** I complete the Google authentication flow
**Then** I am redirected to the dashboard
**And** my user info is stored in AuthContext

**Given** I am authenticated
**When** I click "Sign out"
**Then** I am logged out and returned to the login page

### Story 1.4: Create Dashboard Shell with Routing

As a user,
I want a basic dashboard layout with navigation,
So that I can navigate between different sections of the app.

**Acceptance Criteria:**

**Given** I am authenticated
**When** I access the dashboard
**Then** I see a responsive layout with header and main content area
**And** navigation is visible for Projects, Tokens, and Settings
**And** the layout works on both desktop and mobile viewports
**And** React Router handles navigation between routes
**And** unauthenticated users are redirected to login

---

## Epic 2: Agent Integration & Token Management

**Status: PARTIAL** (Stories 2.1-2.3 complete, Story 2.4 pending)

User can connect AI agents to post updates to the dashboard.

### Story 2.1: Create Firestore Schema for Tokens and Projects

As a user,
I want my projects and tokens stored securely,
So that my agent integrations persist across sessions.

**Acceptance Criteria:**

**Given** an authenticated user
**When** the app initializes
**Then** Firestore collections exist at /users/{uid}/projects and /users/{uid}/agentTokens
**And** security rules restrict access to the authenticated user only
**And** TypeScript types are defined for Project and AgentToken

### Story 2.2: Implement Token Generation and Management

As a user,
I want to generate, view, and revoke agent tokens,
So that I can control which agents can post updates.

**Acceptance Criteria:**

**Given** I am on the Tokens page
**When** I click "Generate New Token"
**Then** a modal appears to label the token and optionally scope it to a project
**And** a new token is created and displayed (shown only once)
**And** the token is saved to Firestore with creation date and label

**Given** I have existing tokens
**When** I view the Tokens page
**Then** I see a list of all tokens with labels, creation dates, and status

**Given** I want to revoke a token
**When** I click "Revoke" on a token
**Then** the token is marked as revoked and can no longer be used

### Story 2.3: Create Cloud Function for Agent Updates

As an AI agent,
I want to POST updates to the dashboard via HTTP,
So that my activity is tracked without needing Firebase SDK.

**Acceptance Criteria:**

**Given** a valid agent token
**When** POST /postUpdate is called with token header and update payload
**Then** the token is validated against Firestore
**And** the update is written to the correct workstream
**And** a success response is returned with the update ID

**Given** an invalid or revoked token
**When** POST /postUpdate is called
**Then** an error response is returned with code INVALID_TOKEN

**Given** a malformed payload
**When** POST /postUpdate is called
**Then** an error response is returned with code INVALID_PAYLOAD

### Story 2.4: Build Onboarding Wizard for New Projects

As a user,
I want a quick setup wizard for new projects,
So that I can start tracking agent activity in under 2 minutes.

**Acceptance Criteria:**

**Given** I click "New Project"
**When** the onboarding wizard opens
**Then** I can enter a project name and optional description

**Given** I complete the project setup step
**When** I proceed to token generation
**Then** a token is automatically generated for this project

**Given** the token is generated
**When** I view the prompt snippet step
**Then** I see a copyable prompt snippet with the API endpoint and token
**And** the snippet is formatted for easy pasting into agent configs

**Given** I complete all steps
**When** I finish the wizard
**Then** the project is created in Firestore
**And** I am taken to the project's workstream view

---

## Epic 3: Activity Feed & Browsing

**Status: NOT STARTED**

User can browse all agent activity organized by project and workstream.

### Story 3.1: Create Firestore Schema for Workstreams and Updates

As a user,
I want my workstreams and updates stored in a browsable structure,
So that I can see all agent activity organized hierarchically.

**Acceptance Criteria:**

**Given** an authenticated user with projects
**When** agents post updates
**Then** updates are stored at /users/{uid}/projects/{pid}/workstreams/{wid}/updates/{uid}
**And** workstreams are auto-created when first update arrives
**And** TypeScript types are defined for Workstream and Update

### Story 3.2: Implement Project List View

As a user,
I want to see all my projects at a glance,
So that I can quickly identify which projects have recent activity.

**Acceptance Criteria:**

**Given** I am on the dashboard home
**When** the page loads
**Then** I see a list of all my projects with names and last activity timestamps
**And** projects are sorted by most recent activity
**And** at least 5 projects display simultaneously (NFR-002)
**And** the view is responsive on mobile and desktop

### Story 3.3: Implement Workstream List View

As a user,
I want to see all workstreams within a project,
So that I can drill down into specific branches or features.

**Acceptance Criteria:**

**Given** I click on a project
**When** the workstream list loads
**Then** I see all workstreams for that project with names and last activity
**And** at least 2 workstreams display per project when they exist (NFR-003)
**And** workstreams show their status (active, paused, completed)
**And** I can navigate back to the project list

### Story 3.4: Implement Update Feed View

As a user,
I want to see the chronological feed of updates within a workstream,
So that I can review what agents have done.

**Acceptance Criteria:**

**Given** I click on a workstream
**When** the update feed loads
**Then** I see updates in reverse chronological order (newest first)
**And** each update shows: summary, tool, model, timestamp, priority
**And** updates load via Firestore onSnapshot for real-time sync
**And** the feed is scrollable with smooth performance

### Story 3.5: Implement Real-Time Update Sync

As a user,
I want to see new updates appear automatically,
So that I don't have to refresh the page.

**Acceptance Criteria:**

**Given** I am viewing a workstream feed
**When** a new update is posted by an agent
**Then** the update appears in the feed within 2 seconds
**And** the UI smoothly animates the new update into view
**And** the project and workstream last-activity timestamps update

---

## Epic 4: Attention & Status Tracking

**Status: NOT STARTED**

User knows exactly what needs their attention right now.

### Story 4.1: Implement Unread Tracking

As a user,
I want updates I haven't seen marked as unread,
So that I know what's new since my last visit.

**Acceptance Criteria:**

**Given** an agent posts an update
**When** I have not viewed that workstream since
**Then** the update is marked as unread in Firestore

**Given** I view a workstream
**When** the feed loads
**Then** all updates in that workstream are marked as read
**And** the read status is persisted to Firestore

### Story 4.2: Display Unread Indicators

As a user,
I want to see unread counts on projects and workstreams,
So that I can quickly spot what needs attention.

**Acceptance Criteria:**

**Given** a project has unread updates
**When** I view the project list
**Then** the project shows an unread indicator with count

**Given** a workstream has unread updates
**When** I view the workstream list
**Then** the workstream shows an unread indicator with count

**Given** all updates are read
**When** I view the lists
**Then** no unread indicators are shown

### Story 4.3: Implement Priority Badges

As a user,
I want priority levels visually distinct,
So that I can identify high-priority items without reading text.

**Acceptance Criteria:**

**Given** updates have priority levels (high/medium/low/debug)
**When** I view the update feed
**Then** each update shows a color-coded priority badge
**And** high = red, medium = yellow, low = green, debug = gray
**And** priority is distinguishable without reading text (NFR-004)

### Story 4.4: Implement Work Awaiting Follow-up Signals

As a user,
I want to see which workstreams have agents waiting for my response,
So that I can prioritize interactive work.

**Acceptance Criteria:**

**Given** an agent's last update indicates "waiting for response"
**When** I view the workstream list
**Then** the workstream shows a distinct "awaiting follow-up" indicator
**And** this is visually different from "work in progress" status

### Story 4.5: Implement Dormant Work Reminders

As a user,
I want to be reminded about work I haven't touched in a while,
So that nothing silently goes stale.

**Acceptance Criteria:**

**Given** a workstream has no activity for 5+ days
**When** I view the project or workstream list
**Then** a "dormant" indicator appears on that workstream

**Given** dormant workstreams exist
**When** I view the dashboard
**Then** a summary alert shows count of dormant workstreams
**And** I can click to see a filtered list of dormant items

---

## Epic 5: Navigation & Search

**Status: NOT STARTED**

User can quickly find and return to any work.

### Story 5.1: Implement Jump-Back Links

As a user,
I want to quickly reopen the context for any update,
So that I can resume work in the right IDE or terminal.

**Acceptance Criteria:**

**Given** I am viewing an update
**When** I click the jump-back action
**Then** I see a copyable command or deep link for that context
**And** the command includes project, branch, and tool information

**Given** I am on mobile
**When** I view an update
**Then** I see context information about what IDE/setup is needed
**And** I can copy the jump-back command for later use

### Story 5.2: Implement Mobile IDE Indicators

As a user on mobile,
I want to know which work requires my Mac vs what I can ideate on,
So that I can prioritize my mobile time effectively.

**Acceptance Criteria:**

**Given** I am viewing projects or workstreams on mobile
**When** the list loads
**Then** each item shows an indicator if it requires IDE access
**And** mobile-friendly items (ideation, review) are visually distinct
**And** I can filter to show only mobile-friendly items

### Story 5.3: Implement Client-Side Search

As a user,
I want to search across all my updates,
So that I can quickly find specific work.

**Acceptance Criteria:**

**Given** I am on the dashboard
**When** I type in the search box
**Then** results filter in real-time as I type
**And** search matches against project names, workstream names, and update summaries
**And** search is performed client-side on loaded data

### Story 5.4: Implement Filter Controls

As a user,
I want to filter updates by various criteria,
So that I can focus on specific types of work.

**Acceptance Criteria:**

**Given** I am viewing any list view
**When** I open the filter panel
**Then** I can filter by: priority level, tool, date range, read/unread status

**Given** I apply filters
**When** the list updates
**Then** only matching items are shown
**And** a clear indicator shows active filters
**And** I can clear all filters with one click
