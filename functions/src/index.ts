import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

admin.initializeApp()

const db = admin.firestore()

// Types
type PriorityLevel = 'high' | 'medium' | 'low' | 'debug'
type AIProvider = 'anthropic' | 'openai' | 'google'

interface PostUpdateRequest {
  project: string
  workstream: string
  summary: string
  tool: string
  model: string
  modelVersion?: string
  priority?: PriorityLevel
}

interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

// GitHub webhook types
interface GitHubCommit {
  id: string
  message: string
  author: {
    name: string
    email: string
    username?: string
  }
  url: string
  added?: string[]
  modified?: string[]
  removed?: string[]
}

interface GitHubPushPayload {
  ref: string
  repository: {
    name: string
    full_name: string
  }
  commits: GitHubCommit[]
  pusher: {
    name: string
    email: string
  }
}

interface GitHubPullRequestPayload {
  action: string
  pull_request: {
    merged: boolean
    html_url: string
    head: {
      ref: string
    }
    title: string
  }
  repository: {
    name: string
    full_name: string
  }
}

// User AI settings
interface UserAISettings {
  aiProvider?: AIProvider
  anthropicKey?: string
  openaiKey?: string
  googleKey?: string
}

// Validate token and get user ID
async function validateToken(token: string): Promise<{ valid: boolean; userId?: string; projectScope?: string }> {
  if (!token) {
    return { valid: false }
  }

  const tokensSnapshot = await db.collectionGroup('agentTokens')
    .where('token', '==', token)
    .where('isRevoked', '==', false)
    .limit(1)
    .get()

  if (!tokensSnapshot.empty) {
    const tokenDoc = tokensSnapshot.docs[0]
    const tokenData = tokenDoc.data()
    const pathParts = tokenDoc.ref.path.split('/')
    const userId = pathParts[1]

    await tokenDoc.ref.update({
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
    })

    return {
      valid: true,
      userId,
      projectScope: tokenData.projectId || undefined
    }
  }

  return { valid: false }
}

// Check if activity is paused for user
async function isActivityPaused(userId: string): Promise<boolean> {
  const settingsDoc = await db.doc(`users/${userId}/settings/preferences`).get()
  if (settingsDoc.exists) {
    const settings = settingsDoc.data()
    return settings?.activityPaused === true
  }
  return false
}

// Get user's AI settings
async function getUserAISettings(userId: string): Promise<UserAISettings> {
  const settingsDoc = await db.doc(`users/${userId}/settings/ai`).get()
  if (settingsDoc.exists) {
    return settingsDoc.data() as UserAISettings
  }
  return {}
}

// Action tag types for AI-generated indicators
type ActionTag = 'needs_attention' | 'question_pending' | 'review_requested' | 'decision_needed' | 'ready_to_merge' | 'blocked' | 'in_progress' | null

type WorkType = 'feature' | 'bugfix' | 'refactor' | 'infrastructure' | 'docs' | 'maintenance'

interface AISummaryResponse {
  summary: string
  actionTag: ActionTag
  workType: WorkType | null
}

// Generate summary using the user's configured AI provider
async function generateAISummary(
  settings: UserAISettings,
  projectName: string,
  commitsContext: string,
  mode: 'workstream' | 'project',
  branchName?: string
): Promise<AISummaryResponse> {
  const workstreamPrompt = `You are helping a developer remember what they were working on after being away. Summarize the FEATURE or GOAL being built, not individual commits.

Project: ${projectName}
Branch: ${branchName || 'unknown'}

Recent commits on this branch:
${commitsContext}

Respond with JSON only, no other text:
{
  "summary": "What feature/goal is being worked on (present progressive, ~20 words)",
  "actionTag": "one of: needs_attention, question_pending, review_requested, decision_needed, ready_to_merge, blocked, in_progress, or null",
  "workType": "one of: feature, bugfix, refactor, infrastructure, docs, maintenance"
}

Summary guidelines:
- Describe the FEATURE or GOAL, not individual commits
- Use present progressive: "Building...", "Fixing...", "Adding...", "Refactoring..."
- Around 20 words (up to 25 max), enough to capture the goal
- Think: what would you tell someone who asks "what were you working on?"
- Use file paths and branch name as clues about the feature area
- Examples of good summaries:
  - "Building a GitHub Issues to Markdown converter with fallback handling for edge cases"
  - "Fixing authentication flow where sessions expire during OAuth callback"
  - "Adding real-time notifications for agent activity updates across all projects"
  - "Refactoring the webhook pipeline to support multiple event types beyond push"
- Examples of bad summaries:
  - "Updated index.ts and fixed a bug" (too vague, commit-level)
  - "Made changes to the authentication system" (no specifics about the goal)

Action tag guidelines:
- IMPORTANT: If branch is main/master/develop/trunk, ALWAYS use null (these branches don't get merged)
- needs_attention: Something requires user action or review
- question_pending: A commit message asked a question or needs clarification
- review_requested: PR or code explicitly needs review (not for main/master branches)
- decision_needed: Needs a yes/no or choice from user
- ready_to_merge: Work appears complete and ready to merge (not for main/master branches)
- blocked: Waiting on external dependency or issue
- in_progress: Actively being worked on, no special attention needed
- null: No clear indicator, general maintenance work, or main/master/develop branches

workType guidelines:
- feature: New functionality being added
- bugfix: Fixing broken behavior
- refactor: Restructuring without changing behavior
- infrastructure: CI/CD, build system, deployment, config
- docs: Documentation changes
- maintenance: Dependency updates, cleanup, minor chores`

  const projectPrompt = `You are helping a developer remember what's happening across a project after being away. Summarize the overall direction and active work.

Project: ${projectName}

Recent activity across all branches:
${commitsContext}

Respond with JSON only, no other text:
{
  "summary": "What is happening in this project overall (~20 words)",
  "actionTag": null,
  "workType": null
}

Summary guidelines:
- Describe the overall project direction, not individual commits
- Use present progressive: "Building...", "Adding...", "Working on..."
- Around 20 words (up to 25 max)
- If multiple features are in progress, mention the 1-2 most significant
- Think: what would you tell someone who asks "what's going on in this project?"
- Examples:
  - "Building a project dashboard with AI summaries and GitHub webhook integration"
  - "Adding multi-provider AI support and improving the branch-level summary experience"`

  const prompt = mode === 'workstream' ? workstreamPrompt : projectPrompt
  const provider = settings.aiProvider || 'anthropic'

  const parseResponse = (text: string): AISummaryResponse => {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary || 'Unable to generate summary.',
          actionTag: parsed.actionTag || null,
          workType: parsed.workType || null
        }
      }
    } catch {
      return { summary: text, actionTag: null, workType: null }
    }
    return { summary: text, actionTag: null, workType: null }
  }

  try {
    if (provider === 'anthropic' && settings.anthropicKey) {
      const client = new Anthropic({ apiKey: settings.anthropicKey })
      const message = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      return parseResponse(text)
    }

    if (provider === 'openai' && settings.openaiKey) {
      const client = new OpenAI({ apiKey: settings.openaiKey })
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
      const text = completion.choices[0]?.message?.content || ''
      return parseResponse(text)
    }

    if (provider === 'google' && settings.googleKey) {
      const genAI = new GoogleGenerativeAI(settings.googleKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const result = await model.generateContent(prompt)
      const text = result.response.text() || ''
      return parseResponse(text)
    }

    return { summary: 'No AI provider configured. Add your API key in Settings.', actionTag: null, workType: null }
  } catch (error) {
    console.error(`AI summary error (${provider}):`, error)
    return { summary: 'Failed to generate summary. Check your API key in Settings.', actionTag: null, workType: null }
  }
}

// Optional metadata for enriched updates
interface UpdateMetadata {
  commitBody?: string
  filesChanged?: string[]
  commitUrl?: string
  repoFullName?: string
}

// Create an update for a user
async function createUpdate(
  userId: string,
  project: string,
  workstream: string,
  summary: string,
  tool: string,
  model: string,
  priority: PriorityLevel = 'medium',
  metadata?: UpdateMetadata
): Promise<string> {
  const now = admin.firestore.FieldValue.serverTimestamp()

  // Normalize branch/workstream name: strip refs/heads/ prefix
  const normalizedWorkstream = workstream.replace(/^refs\/heads\//, '')

  const projectsRef = db.collection('users').doc(userId).collection('projects')
  const projectQuery = await projectsRef.where('name', '==', project).limit(1).get()

  let projectRef: admin.firestore.DocumentReference

  if (projectQuery.empty) {
    const projectData: Record<string, any> = {
      name: project,
      createdAt: now,
      lastActivityAt: now
    }
    if (metadata?.repoFullName) projectData.fullName = metadata.repoFullName
    projectRef = await projectsRef.add(projectData)
  } else {
    projectRef = projectQuery.docs[0].ref
    const updateData: Record<string, any> = { lastActivityAt: now }
    if (metadata?.repoFullName) updateData.fullName = metadata.repoFullName
    await projectRef.update(updateData)
  }

  const workstreamsRef = projectRef.collection('workstreams')
  const workstreamQuery = await workstreamsRef.where('name', '==', normalizedWorkstream).limit(1).get()

  let workstreamRef: admin.firestore.DocumentReference

  if (workstreamQuery.empty) {
    workstreamRef = await workstreamsRef.add({
      name: normalizedWorkstream,
      projectId: projectRef.id,
      status: 'active',
      lastActivityAt: now
    })
  } else {
    workstreamRef = workstreamQuery.docs[0].ref
    await workstreamRef.update({ lastActivityAt: now })
  }

  const updateData: Record<string, any> = {
    workstreamId: workstreamRef.id,
    projectId: projectRef.id,
    summary,
    tool,
    model,
    priority,
    timestamp: now,
    isRead: false
  }

  if (metadata?.commitBody) updateData.commitBody = metadata.commitBody
  if (metadata?.filesChanged?.length) updateData.filesChanged = metadata.filesChanged
  if (metadata?.commitUrl) updateData.commitUrl = metadata.commitUrl

  const updateRef = await workstreamRef.collection('updates').add(updateData)

  return updateRef.id
}

// Determine priority from commit message
function getPriorityFromCommit(message: string): PriorityLevel {
  const lowerMsg = message.toLowerCase()
  if (lowerMsg.startsWith('fix') || lowerMsg.startsWith('hotfix') || lowerMsg.includes('!:')) {
    return 'high'
  }
  if (lowerMsg.startsWith('docs') || lowerMsg.startsWith('chore') || lowerMsg.startsWith('style')) {
    return 'low'
  }
  return 'medium'
}

// POST /postUpdate - Agent update endpoint
export const postUpdate = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      const response: ApiErrorResponse = {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' }
      }
      res.status(405).json(response)
      return
    }

    const token = req.headers['x-agent-token'] as string
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'X-Agent-Token header is required' } })
      return
    }

    const tokenResult = await validateToken(token)
    if (!tokenResult.valid || !tokenResult.userId) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token is invalid or has been revoked' } })
      return
    }

    if (await isActivityPaused(tokenResult.userId)) {
      res.status(403).json({ success: false, error: { code: 'ACTIVITY_PAUSED', message: 'Activity tracking is paused.' } })
      return
    }

    const body = req.body as PostUpdateRequest
    if (!body.project || !body.workstream || !body.summary || !body.tool || !body.model) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Missing required fields' } })
      return
    }

    if (tokenResult.projectScope && tokenResult.projectScope !== body.project) {
      res.status(403).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token not authorized for this project' } })
      return
    }

    try {
      const updateId = await createUpdate(
        tokenResult.userId, body.project, body.workstream, body.summary, body.tool, body.model, body.priority
      )
      res.status(200).json({ success: true, data: { updateId, timestamp: new Date().toISOString() } })
    } catch (error) {
      console.error('Error creating update:', error)
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } })
    }
  }
)

// POST /summarize - AI-generated summary for a project or workstream
export const summarize = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const token = req.headers['x-agent-token'] as string
    if (!token) {
      res.status(401).json({ error: 'Token required' })
      return
    }

    const tokenResult = await validateToken(token)
    if (!tokenResult.valid || !tokenResult.userId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    const { projectId, workstreamId } = req.body
    if (!projectId) {
      res.status(400).json({ error: 'projectId required' })
      return
    }

    try {
      const userId = tokenResult.userId

      // Get user's AI settings
      const aiSettings = await getUserAISettings(userId)

      // Fetch recent updates for context
      interface UpdateContext {
        summary: string
        timestamp: string
        tool: string
        commitBody?: string
        filesChanged?: string[]
      }
      let updatesData: UpdateContext[] = []
      let branchName: string | undefined

      if (workstreamId) {
        // Get branch name from workstream doc
        const wsDoc = await db.doc(`users/${userId}/projects/${projectId}/workstreams/${workstreamId}`).get()
        branchName = wsDoc.data()?.name

        const updatesRef = db.collection(`users/${userId}/projects/${projectId}/workstreams/${workstreamId}/updates`)
        const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(20).get()
        updatesData = updatesSnap.docs.map(doc => {
          const data = doc.data()
          return {
            summary: data.summary,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
            tool: data.tool,
            commitBody: data.commitBody,
            filesChanged: data.filesChanged
          }
        })
      } else {
        const workstreamsRef = db.collection(`users/${userId}/projects/${projectId}/workstreams`)
        const workstreamsSnap = await workstreamsRef.get()

        for (const wsDoc of workstreamsSnap.docs) {
          const wsData = wsDoc.data()
          const updatesRef = wsDoc.ref.collection('updates')
          const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(10).get()
          updatesSnap.docs.forEach(doc => {
            const data = doc.data()
            updatesData.push({
              summary: `[${wsData.name}] ${data.summary}`,
              timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
              tool: data.tool,
              commitBody: data.commitBody,
              filesChanged: data.filesChanged
            })
          })
        }

        updatesData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        updatesData = updatesData.slice(0, 20)
      }

      if (updatesData.length === 0) {
        res.status(200).json({ success: true, summary: 'No recent activity to summarize.' })
        return
      }

      const projectDoc = await db.doc(`users/${userId}/projects/${projectId}`).get()
      const projectName = projectDoc.data()?.name || 'Unknown Project'

      // Build enriched context with commit bodies and file paths
      const commitsContext = updatesData.map(u => {
        let line = `- ${u.summary}`
        if (u.commitBody) line += `\n  Body: ${u.commitBody}`
        if (u.filesChanged?.length) line += `\n  Files: ${u.filesChanged.slice(0, 10).join(', ')}${u.filesChanged.length > 10 ? ` (+${u.filesChanged.length - 10} more)` : ''}`
        return line
      }).join('\n')

      const mode = workstreamId ? 'workstream' : 'project'
      const result = await generateAISummary(aiSettings, projectName, commitsContext, mode, branchName)

      res.status(200).json({
        success: true,
        summary: result.summary,
        actionTag: result.actionTag,
        workType: result.workType
      })
    } catch (error) {
      console.error('Error generating summary:', error)
      res.status(500).json({ error: 'Failed to generate summary' })
    }
  }
)

// Export sync and dedupe functions
export { syncDeletedBranches } from './sync-deleted-branches'

// POST /deleteProject - Delete a project and all its workstreams/updates
export const deleteProject = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const token = req.headers['x-agent-token'] as string
    const projectName = req.body.projectName

    if (!token || !projectName) {
      res.status(400).json({ error: 'agentToken and projectName required' })
      return
    }

    const tokenResult = await validateToken(token)
    if (!tokenResult.valid || !tokenResult.userId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    try {
      const userId = tokenResult.userId
      const projectsRef = db.collection('users').doc(userId).collection('projects')
      const projectQuery = await projectsRef.where('name', '==', projectName).limit(1).get()

      if (projectQuery.empty) {
        res.status(404).json({ error: 'Project not found' })
        return
      }

      const projectDoc = projectQuery.docs[0]
      let workstreamsDeleted = 0
      let updatesDeleted = 0

      // Delete all workstreams and their updates
      const workstreamsSnapshot = await projectDoc.ref.collection('workstreams').get()

      for (const wsDoc of workstreamsSnapshot.docs) {
        const updatesSnapshot = await wsDoc.ref.collection('updates').get()
        updatesDeleted += updatesSnapshot.size

        for (const updateDoc of updatesSnapshot.docs) {
          await updateDoc.ref.delete()
        }

        await wsDoc.ref.delete()
        workstreamsDeleted++
      }

      // Delete the project
      await projectDoc.ref.delete()

      res.status(200).json({
        success: true,
        projectName,
        workstreamsDeleted,
        updatesDeleted
      })
    } catch (error) {
      console.error('Error deleting project:', error)
      res.status(500).json({ error: 'Failed to delete project' })
    }
  }
)

// POST /dedupeWorkstreams - Remove duplicate workstreams with different branch name variants
export const dedupeWorkstreams = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const token = req.headers['x-agent-token'] as string
    if (!token) {
      res.status(401).json({ error: 'Token required' })
      return
    }

    const tokenResult = await validateToken(token)
    if (!tokenResult.valid || !tokenResult.userId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    try {
      const userId = tokenResult.userId
      let duplicatesFound = 0
      let duplicatesFixed = 0

      const projectsSnapshot = await db.collection('users').doc(userId).collection('projects').get()

      for (const projectDoc of projectsSnapshot.docs) {
        const workstreamsRef = projectDoc.ref.collection('workstreams')
        const workstreamsSnapshot = await workstreamsRef.get()

        // Group by normalized name
        const byNormalizedName: { [key: string]: any[] } = {}

        for (const wsDoc of workstreamsSnapshot.docs) {
          const wsData = wsDoc.data()
          const normalizedName = wsData.name.replace(/^refs\/heads\//, '')

          if (!byNormalizedName[normalizedName]) {
            byNormalizedName[normalizedName] = []
          }

          byNormalizedName[normalizedName].push({
            id: wsDoc.id,
            ref: wsDoc.ref,
            data: wsData
          })
        }

        // Fix duplicates
        for (const workstreams of Object.values(byNormalizedName)) {
          if (workstreams.length > 1) {
            duplicatesFound += workstreams.length - 1

            // Keep the one with most recent activity
            workstreams.sort((a, b) => {
              const aTime = a.data.lastActivityAt?.toMillis?.() || 0
              const bTime = b.data.lastActivityAt?.toMillis?.() || 0
              return bTime - aTime
            })

            const keep = workstreams[0]
            const remove = workstreams.slice(1)

            // Update kept workstream to use normalized name
            const normalizedName = keep.data.name.replace(/^refs\/heads\//, '')
            await keep.ref.update({ name: normalizedName })

            // Delete duplicates
            for (const ws of remove) {
              await ws.ref.delete()
              duplicatesFixed++
            }
          }
        }
      }

      res.status(200).json({
        success: true,
        duplicatesFound,
        duplicatesFixed
      })
    } catch (error) {
      console.error('Error deduping workstreams:', error)
      res.status(500).json({ error: 'Failed to dedupe' })
    }
  }
)

// POST /githubWebhook - GitHub webhook endpoint
export const githubWebhook = onRequest(
  { cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    const token = req.query.token as string
    if (!token) {
      res.status(401).json({ error: 'Token required in query parameter' })
      return
    }

    const tokenResult = await validateToken(token)
    if (!tokenResult.valid || !tokenResult.userId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    if (await isActivityPaused(tokenResult.userId)) {
      res.status(200).json({ message: 'Activity paused, webhook ignored' })
      return
    }

    const githubEvent = req.headers['x-github-event'] as string
    if (githubEvent !== 'push' && githubEvent !== 'pull_request') {
      res.status(200).json({ message: `Event ${githubEvent} ignored` })
      return
    }

    try {
      if (githubEvent === 'pull_request') {
        const payload = req.body as GitHubPullRequestPayload
        const project = payload.repository.name

        if (tokenResult.projectScope && tokenResult.projectScope !== project) {
          res.status(200).json({ message: 'Project not in token scope, ignored' })
          return
        }

        // Only handle merged PRs
        if (payload.action !== 'closed' || !payload.pull_request.merged) {
          res.status(200).json({ message: 'PR event ignored (not a merge)' })
          return
        }

        const branch = payload.pull_request.head.ref
        const userId = tokenResult.userId

        // Find the project
        const projectsRef = db.collection('users').doc(userId).collection('projects')
        const projectQuery = await projectsRef.where('name', '==', project).limit(1).get()

        if (projectQuery.empty) {
          res.status(200).json({ message: 'Project not found, ignored' })
          return
        }

        const projectRef = projectQuery.docs[0].ref

        // Find the workstream by branch name
        const workstreamsRef = projectRef.collection('workstreams')
        const workstreamQuery = await workstreamsRef.where('name', '==', branch).limit(1).get()

        if (workstreamQuery.empty) {
          res.status(200).json({ message: 'Workstream not found for branch, ignored' })
          return
        }

        const workstreamRef = workstreamQuery.docs[0].ref
        await workstreamRef.update({
          status: 'completed',
          mergedAt: admin.firestore.FieldValue.serverTimestamp(),
          mergedPrUrl: payload.pull_request.html_url,
          actionTag: null
        })

        res.status(200).json({ success: true, message: `Marked branch ${branch} as merged` })
        return
      }

      // Handle push events
      const payload = req.body as GitHubPushPayload
      const branch = payload.ref.replace('refs/heads/', '')
      const project = payload.repository.name

      if (tokenResult.projectScope && tokenResult.projectScope !== project) {
        res.status(200).json({ message: 'Project not in token scope, ignored' })
        return
      }

      const updateIds: string[] = []

      for (const commit of payload.commits) {
        const messageLines = commit.message.split('\n')
        const summary = `[${commit.id.substring(0, 7)}] ${messageLines[0]}`
        const commitBody = messageLines.slice(1).join('\n').trim() || undefined
        const filesChanged = [
          ...(commit.added || []),
          ...(commit.modified || []),
          ...(commit.removed || [])
        ]
        const priority = getPriorityFromCommit(commit.message)
        const updateId = await createUpdate(
          tokenResult.userId, project, branch, summary, 'github', 'git', priority,
          { commitBody, filesChanged: filesChanged.length > 0 ? filesChanged : undefined, commitUrl: commit.url, repoFullName: payload.repository.full_name }
        )
        updateIds.push(updateId)
      }

      res.status(200).json({ success: true, message: `Processed ${updateIds.length} commits`, updateIds })
    } catch (error) {
      console.error('Error processing GitHub webhook:', error)
      res.status(500).json({ error: 'Internal error processing webhook' })
    }
  }
)
