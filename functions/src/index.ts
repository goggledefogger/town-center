import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

admin.initializeApp()

const db = admin.firestore()

// Types
type PriorityLevel = 'high' | 'medium' | 'low' | 'debug'

interface PostUpdateRequest {
  project: string
  workstream: string
  summary: string
  tool: string
  model: string
  modelVersion?: string
  priority?: PriorityLevel
}

interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

// Validate token and get user ID
async function validateToken(token: string): Promise<{ valid: boolean; userId?: string; projectScope?: string }> {
  if (!token) {
    return { valid: false }
  }

  // Use collection group query to search all agentTokens subcollections
  const tokensSnapshot = await db.collectionGroup('agentTokens')
    .where('token', '==', token)
    .where('isRevoked', '==', false)
    .limit(1)
    .get()

  if (!tokensSnapshot.empty) {
    const tokenDoc = tokensSnapshot.docs[0]
    const tokenData = tokenDoc.data()

    // Extract userId from the document path: users/{userId}/agentTokens/{tokenId}
    const pathParts = tokenDoc.ref.path.split('/')
    const userId = pathParts[1] // users/{userId}/agentTokens/{tokenId}

    // Update last used timestamp
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

// POST /postUpdate - Agent update endpoint
export const postUpdate = onRequest(
  { cors: true },
  async (req, res) => {
    // Only allow POST
    if (req.method !== 'POST') {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST method is allowed'
        }
      }
      res.status(405).json(response)
      return
    }

    // Get token from header
    const token = req.headers['x-agent-token'] as string

    if (!token) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'X-Agent-Token header is required'
        }
      }
      res.status(401).json(response)
      return
    }

    // Validate token
    const tokenResult = await validateToken(token)

    if (!tokenResult.valid || !tokenResult.userId) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is invalid or has been revoked'
        }
      }
      res.status(401).json(response)
      return
    }

    // Check if activity tracking is paused for this user
    const settingsDoc = await db.doc(`users/${tokenResult.userId}/settings/preferences`).get()
    if (settingsDoc.exists) {
      const settings = settingsDoc.data()
      if (settings?.activityPaused) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'ACTIVITY_PAUSED',
            message: 'Activity tracking is paused. Enable it in dashboard settings to resume.'
          }
        }
        res.status(403).json(response)
        return
      }
    }

    // Parse and validate request body
    const body = req.body as PostUpdateRequest

    if (!body.project || !body.workstream || !body.summary || !body.tool || !body.model) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Missing required fields: project, workstream, summary, tool, model'
        }
      }
      res.status(400).json(response)
      return
    }

    // Check project scope if token is scoped
    if (tokenResult.projectScope && tokenResult.projectScope !== body.project) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is not authorized for this project'
        }
      }
      res.status(403).json(response)
      return
    }

    try {
      const userId = tokenResult.userId
      const now = admin.firestore.FieldValue.serverTimestamp()

      // Get or create project
      const projectsRef = db.collection('users').doc(userId).collection('projects')
      let projectQuery = await projectsRef.where('name', '==', body.project).limit(1).get()

      let projectRef: admin.firestore.DocumentReference

      if (projectQuery.empty) {
        // Create project
        projectRef = await projectsRef.add({
          name: body.project,
          createdAt: now,
          lastActivityAt: now
        })
      } else {
        projectRef = projectQuery.docs[0].ref
        await projectRef.update({ lastActivityAt: now })
      }

      // Get or create workstream
      const workstreamsRef = projectRef.collection('workstreams')
      let workstreamQuery = await workstreamsRef.where('name', '==', body.workstream).limit(1).get()

      let workstreamRef: admin.firestore.DocumentReference

      if (workstreamQuery.empty) {
        // Create workstream
        workstreamRef = await workstreamsRef.add({
          name: body.workstream,
          projectId: projectRef.id,
          status: 'active',
          lastActivityAt: now
        })
      } else {
        workstreamRef = workstreamQuery.docs[0].ref
        await workstreamRef.update({ lastActivityAt: now })
      }

      // Create update
      const updateRef = await workstreamRef.collection('updates').add({
        workstreamId: workstreamRef.id,
        projectId: projectRef.id,
        summary: body.summary,
        tool: body.tool,
        model: body.model,
        modelVersion: body.modelVersion || null,
        priority: body.priority || 'medium',
        timestamp: now,
        isRead: false
      })

      const response: ApiResponse<{ updateId: string; timestamp: string }> = {
        success: true,
        data: {
          updateId: updateRef.id,
          timestamp: new Date().toISOString()
        }
      }

      res.status(200).json(response)
    } catch (error) {
      console.error('Error creating update:', error)
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred'
        }
      }
      res.status(500).json(response)
    }
  }
)
