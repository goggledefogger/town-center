/**
 * Cloud Function to sync deleted branches from GitHub
 *
 * This function can be triggered:
 * 1. Manually via HTTP request
 * 2. On a schedule (Cloud Scheduler)
 *
 * It checks GitHub to see which branches still exist and marks
 * deleted branches as completed in Firestore.
 */

import { onRequest } from 'firebase-functions/v2/https'
// import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { Octokit } from '@octokit/rest'

const db = admin.firestore()

interface SyncResult {
  projectsChecked: number
  workstreamsChecked: number
  markedCompleted: number
  errors: string[]
}

async function checkBranchExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch })
    return true
  } catch (error: any) {
    if (error.status === 404) return false
    throw error
  }
}

async function syncDeletedBranchesForUser(
  userId: string,
  githubToken: string
): Promise<SyncResult> {
  const result: SyncResult = {
    projectsChecked: 0,
    workstreamsChecked: 0,
    markedCompleted: 0,
    errors: []
  }

  const octokit = new Octokit({ auth: githubToken })

  const projectsRef = db.collection('users').doc(userId).collection('projects')
  const projectsSnap = await projectsRef.get()

  for (const projectDoc of projectsSnap.docs) {
    const projectData = projectDoc.data()
    const fullName = projectData.fullName || projectData.name

    const [owner, repo] = fullName.includes('/')
      ? fullName.split('/')
      : [null, fullName]

    if (!owner || !repo) {
      result.errors.push(`Cannot parse owner/repo for project: ${projectData.name}`)
      continue
    }

    result.projectsChecked++

    const workstreamsRef = projectDoc.ref.collection('workstreams')
    const workstreamsSnap = await workstreamsRef
      .where('status', '==', 'active')
      .get()

    for (const wsDoc of workstreamsSnap.docs) {
      const wsData = wsDoc.data()
      const branchName = wsData.name
      result.workstreamsChecked++

      try {
        const exists = await checkBranchExists(octokit, owner, repo, branchName)

        if (!exists) {
          console.log(`Branch ${owner}/${repo}:${branchName} doesn't exist - marking as completed`)

          await wsDoc.ref.update({
            status: 'completed',
            mergedAt: admin.firestore.FieldValue.serverTimestamp(),
            actionTag: null
          })

          result.markedCompleted++
        }

        // Rate limit: 100ms between API calls
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error: any) {
        result.errors.push(`Error checking ${owner}/${repo}:${branchName} - ${error.message}`)
      }
    }
  }

  return result
}

// Helper to validate agent token and get user ID (imported from index.ts logic)
async function validateAgentToken(token: string): Promise<string | null> {
  const tokensSnapshot = await db.collectionGroup('agentTokens')
    .where('token', '==', token)
    .where('isRevoked', '==', false)
    .limit(1)
    .get()

  if (!tokensSnapshot.empty) {
    const tokenDoc = tokensSnapshot.docs[0]
    const pathParts = tokenDoc.ref.path.split('/')
    return pathParts[1] // userId
  }

  return null
}

// HTTP endpoint for manual sync
export const syncDeletedBranches = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const agentToken = req.body.agentToken
    const githubToken = req.body.githubToken

    if (!agentToken || !githubToken) {
      res.status(400).json({ error: 'agentToken and githubToken required' })
      return
    }

    // Validate agent token and get user ID
    const userId = await validateAgentToken(agentToken)
    if (!userId) {
      res.status(401).json({ error: 'Invalid agent token' })
      return
    }

    try {
      const result = await syncDeletedBranchesForUser(userId, githubToken)
      res.status(200).json({ success: true, result })
    } catch (error: any) {
      console.error('Error syncing deleted branches:', error)
      res.status(500).json({ error: error.message })
    }
  }
)

// Scheduled function (runs daily at 2 AM UTC)
// Disabled by default - uncomment to enable
/*
export const syncDeletedBranchesScheduled = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    timeZone: 'UTC'
  },
  async (event) => {
    // You'd need to store GitHub tokens in Firestore per-user
    // and iterate through all users
    console.log('Scheduled sync not implemented yet')
  }
)
*/
