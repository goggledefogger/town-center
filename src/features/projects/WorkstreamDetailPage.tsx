import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  updateDoc as firestoreUpdateDoc
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatRelativeTime } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { Project, Workstream, Update } from '../../types'
import { Spinner } from '../../components/Spinner'

export function WorkstreamDetailPage() {
  const { projectId, workstreamId } = useParams<{ projectId: string; workstreamId: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [workstream, setWorkstream] = useState<Workstream | null>(null)
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !projectId || !workstreamId) return

    // Listen to project
    const projectRef = doc(db, 'users', user.uid, 'projects', projectId)
    const unsubProject = onSnapshot(projectRef, (doc) => {
      if (doc.exists()) {
        setProject({ id: doc.id, ...doc.data() } as Project)
      }
    })

    // Listen to workstream
    const workstreamRef = doc(db, 'users', user.uid, 'projects', projectId, 'workstreams', workstreamId)
    const unsubWorkstream = onSnapshot(workstreamRef, (doc) => {
      if (doc.exists()) {
        setWorkstream({ id: doc.id, ...doc.data() } as Workstream)
      }
    })

    // Listen to updates
    const updatesRef = collection(db, 'users', user.uid, 'projects', projectId, 'workstreams', workstreamId, 'updates')
    const q = query(updatesRef, orderBy('timestamp', 'desc'))
    const unsubUpdates = onSnapshot(q, async (snapshot) => {
      const list: Update[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Update))
      setUpdates(list)
      setLoading(false)

      // Mark unread updates as read
      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data()
        if (!data.isRead) {
          await firestoreUpdateDoc(docSnapshot.ref, { isRead: true })
        }
      }
    })

    return () => {
      unsubProject()
      unsubWorkstream()
      unsubUpdates()
    }
  }, [user, projectId, workstreamId])

  const formatTime = (timestamp: any) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getPriorityBadge = (priority: string) => {
    const styles = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      debug: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
    }
    return styles[priority as keyof typeof styles] || styles.medium
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to={`/projects/${projectId}`}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link to="/" className="hover:underline">Projects</Link>
            <span>/</span>
            <Link to={`/projects/${projectId}`} className="hover:underline">{project?.name}</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {workstream?.name}
          </h1>
        </div>
      </div>

      {/* Merged Banner */}
      {workstream?.status === 'completed' && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <span className="font-medium text-sm">
                This branch was merged{workstream.mergedAt ? ` ${formatRelativeTime(workstream.mergedAt)}` : ''}
              </span>
            </div>
            {workstream.mergedPrUrl && (
              <a
                href={workstream.mergedPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors"
              >
                View PR
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Updates Feed */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Updates
        </h2>

        {updates.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              No updates yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((update) => (
              <div
                key={update.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${update.isRead ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityBadge(update.priority)}`}>
                        {update.priority}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {update.tool} · {update.model}
                      </span>
                    </div>
                    <p className="text-gray-900 dark:text-white whitespace-pre-line">
                      {update.summary}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(update.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
