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

interface AISummaryResponse {
  summary: string
  actionTag: ActionTag
}

// Generate summary using the user's configured AI provider
async function generateAISummary(
  settings: UserAISettings,
  projectName: string,
  commitsContext: string,
  isWorkstream: boolean
): Promise<AISummaryResponse> {
  const prompt = `You are summarizing recent development activity for a project dashboard. Be concise and helpful.

Project: ${projectName}
${isWorkstream ? 'Branch activity:' : 'Recent activity across all branches:'}

${commitsContext}

Respond with JSON only, no other text:
{
  "summary": "One plain-English sentence about what's happening",
  "actionTag": "one of: needs_attention, question_pending, review_requested, decision_needed, ready_to_merge, blocked, in_progress, or null"
}

Summary guidelines:
- ONE short sentence (under 15 words ideal)
- Write like you're telling a friend: "Added dark mode" not "Implemented dark mode feature functionality"
- Focus on the WHAT, skip the technical details
- Examples of good summaries:
  - "Added user login and signup pages"
  - "Fixing a bug with form validation"
  - "Refactoring the API to be cleaner"
  - "Setting up the database schema"
- Skip commit hashes, file names, and jargon

Action tag guidelines:
- needs_attention: Something requires user action or review
- question_pending: A commit message asked a question or needs clarification
- review_requested: PR or code explicitly needs review
- decision_needed: Needs a yes/no or choice from user
- ready_to_merge: Work appears complete and ready to merge
- blocked: Waiting on external dependency or issue
- in_progress: Actively being worked on, no special attention needed
- null: No clear indicator or general maintenance work`

  const provider = settings.aiProvider || 'anthropic'

  const parseResponse = (text: string): AISummaryResponse => {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary || 'Unable to generate summary.',
          actionTag: parsed.actionTag || null
        }
      }
    } catch {
      // If JSON parsing fails, use the raw text as summary
      return { summary: text, actionTag: null }
    }
    return { summary: text, actionTag: null }
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

    return { summary: 'No AI provider configured. Add your API key in Settings.', actionTag: null }
  } catch (error) {
    console.error(`AI summary error (${provider}):`, error)
    return { summary: 'Failed to generate summary. Check your API key in Settings.', actionTag: null }
  }
}

// Create an update for a user
async function createUpdate(
  userId: string,
  project: string,
  workstream: string,
  summary: string,
  tool: string,
  model: string,
  priority: PriorityLevel = 'medium'
): Promise<string> {
  const now = admin.firestore.FieldValue.serverTimestamp()

  const projectsRef = db.collection('users').doc(userId).collection('projects')
  const projectQuery = await projectsRef.where('name', '==', project).limit(1).get()

  let projectRef: admin.firestore.DocumentReference

  if (projectQuery.empty) {
    projectRef = await projectsRef.add({
      name: project,
      createdAt: now,
      lastActivityAt: now
    })
  } else {
    projectRef = projectQuery.docs[0].ref
    await projectRef.update({ lastActivityAt: now })
  }

  const workstreamsRef = projectRef.collection('workstreams')
  const workstreamQuery = await workstreamsRef.where('name', '==', workstream).limit(1).get()

  let workstreamRef: admin.firestore.DocumentReference

  if (workstreamQuery.empty) {
    workstreamRef = await workstreamsRef.add({
      name: workstream,
      projectId: projectRef.id,
      status: 'active',
      lastActivityAt: now
    })
  } else {
    workstreamRef = workstreamQuery.docs[0].ref
    await workstreamRef.update({ lastActivityAt: now })
  }

  const updateRef = await workstreamRef.collection('updates').add({
    workstreamId: workstreamRef.id,
    projectId: projectRef.id,
    summary,
    tool,
    model,
    priority,
    timestamp: now,
    isRead: false
  })

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
      let updatesData: { summary: string; timestamp: any; tool: string }[] = []

      if (workstreamId) {
        const updatesRef = db.collection(`users/${userId}/projects/${projectId}/workstreams/${workstreamId}/updates`)
        const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(20).get()
        updatesData = updatesSnap.docs.map(doc => {
          const data = doc.data()
          return { summary: data.summary, timestamp: data.timestamp?.toDate?.()?.toISOString() || '', tool: data.tool }
        })
      } else {
        const workstreamsRef = db.collection(`users/${userId}/projects/${projectId}/workstreams`)
        const workstreamsSnap = await workstreamsRef.get()

        for (const wsDoc of workstreamsSnap.docs) {
          const updatesRef = wsDoc.ref.collection('updates')
          const updatesSnap = await updatesRef.orderBy('timestamp', 'desc').limit(10).get()
          updatesSnap.docs.forEach(doc => {
            const data = doc.data()
            updatesData.push({ summary: data.summary, timestamp: data.timestamp?.toDate?.()?.toISOString() || '', tool: data.tool })
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

      const commitsContext = updatesData.map(u => `- ${u.summary}`).join('\n')

      const result = await generateAISummary(aiSettings, projectName, commitsContext, !!workstreamId)

      res.status(200).json({ success: true, summary: result.summary, actionTag: result.actionTag })
    } catch (error) {
      console.error('Error generating summary:', error)
      res.status(500).json({ error: 'Failed to generate summary' })
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
    if (githubEvent !== 'push') {
      res.status(200).json({ message: `Event ${githubEvent} ignored` })
      return
    }

    try {
      const payload = req.body as GitHubPushPayload
      const branch = payload.ref.replace('refs/heads/', '')
      const project = payload.repository.name

      if (tokenResult.projectScope && tokenResult.projectScope !== project) {
        res.status(200).json({ message: 'Project not in token scope, ignored' })
        return
      }

      const updateIds: string[] = []

      for (const commit of payload.commits) {
        const summary = `[${commit.id.substring(0, 7)}] ${commit.message.split('\n')[0]}`
        const priority = getPriorityFromCommit(commit.message)
        const updateId = await createUpdate(tokenResult.userId, project, branch, summary, 'github', 'git', priority)
        updateIds.push(updateId)
      }

      res.status(200).json({ success: true, message: `Processed ${updateIds.length} commits`, updateIds })
    } catch (error) {
      console.error('Error processing GitHub webhook:', error)
      res.status(500).json({ error: 'Internal error processing webhook' })
    }
  }
)
