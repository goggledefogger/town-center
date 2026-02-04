import { Timestamp } from 'firebase/firestore'

export type AgentToken = {
  id: string
  label: string
  token: string // The actual token value
  projectId?: string // Optional scoping to a specific project
  createdAt: Timestamp
  isRevoked: boolean
  revokedAt?: Timestamp
  lastUsedAt?: Timestamp
}
