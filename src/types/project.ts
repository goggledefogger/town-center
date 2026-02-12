import { Timestamp } from 'firebase/firestore'

export type ProjectCategory = 'work' | 'personal' | string

export type WorkstreamStatus = 'active' | 'paused' | 'completed'

export type WorkType = 'feature' | 'bugfix' | 'refactor' | 'infrastructure' | 'docs' | 'maintenance'

// AI-generated action indicators for at-a-glance triage
export type ActionTag =
  | 'needs_attention'    // Something needs user action
  | 'question_pending'   // AI or commit asked a question
  | 'review_requested'   // PR or code needs review
  | 'decision_needed'    // Needs a yes/no or choice
  | 'ready_to_merge'     // Work is done, ready to merge
  | 'blocked'            // Waiting on something external
  | 'in_progress'        // Actively being worked on
  | null                 // No special indicator

export type Project = {
  id: string
  name: string
  fullName?: string
  description?: string
  category?: ProjectCategory
  createdAt: Timestamp
  lastActivityAt: Timestamp
  aiSummary?: string
  summaryGeneratedAt?: Timestamp
}

export type Workstream = {
  id: string
  projectId: string
  name: string
  status: WorkstreamStatus
  lastActivityAt: Timestamp
  aiSummary?: string
  actionTag?: ActionTag
  workType?: WorkType
  summaryGeneratedAt?: Timestamp
  mergedAt?: Timestamp
  mergedPrUrl?: string
}
