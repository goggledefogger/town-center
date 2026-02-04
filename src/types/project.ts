import { Timestamp } from 'firebase/firestore'

export type ProjectCategory = 'work' | 'personal' | string

export type WorkstreamStatus = 'active' | 'paused' | 'completed'

export type Project = {
  id: string
  name: string
  description?: string
  category?: ProjectCategory
  createdAt: Timestamp
  lastActivityAt: Timestamp
}

export type Workstream = {
  id: string
  projectId: string
  name: string
  status: WorkstreamStatus
  lastActivityAt: Timestamp
}
