import { Timestamp } from 'firebase/firestore'

export type PriorityLevel = 'high' | 'medium' | 'low' | 'debug'

export type UpdateStatus = 'in_progress' | 'waiting_for_response' | 'completed'

export type Update = {
  id: string
  workstreamId: string
  projectId: string
  summary: string
  tool: string
  model: string
  modelVersion?: string
  priority: PriorityLevel
  status?: UpdateStatus
  timestamp: Timestamp
  isRead: boolean
}
