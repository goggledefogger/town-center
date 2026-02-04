import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { Project, Workstream, Update } from '../../types'
import { Spinner } from '../../components/Spinner'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [recentUpdates, setRecentUpdates] = useState<(Update & { workstreamName: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !projectId) return

    // Listen to project
    const projectRef = doc(db, 'users', user.uid, 'projects', projectId)
    const unsubProject = onSnapshot(projectRef, (doc) => {
      if (doc.exists()) {
        setProject({ id: doc.id, ...doc.data() } as Project)
      }
    })

    // Listen to workstreams
    const workstreamsRef = collection(db, 'users', user.uid, 'projects', projectId, 'workstreams')
    const q = query(workstreamsRef, orderBy('lastActivityAt', 'desc'))
    const unsubWorkstreams = onSnapshot(q, async (snapshot) => {
      const list: Workstream[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Workstream))
      setWorkstreams(list)

      // Fetch recent updates from all workstreams
      const updates: (Update & { workstreamName: string })[] = []
      for (const wsDoc of snapshot.docs) {
        const wsData = wsDoc.data()
        const updatesRef = collection(wsDoc.ref, 'updates')
        const updatesQuery = query(updatesRef, orderBy('timestamp', 'desc'), limit(5))
        const updatesSnap = await getDocs(updatesQuery)
        updatesSnap.docs.forEach(uDoc => {
          updates.push({
            id: uDoc.id,
            ...uDoc.data(),
            workstreamName: wsData.name
          } as Update & { workstreamName: string })
        })
      }

      // Sort and take most recent
      updates.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.() || new Date(0)
        const bTime = b.timestamp?.toDate?.() || new Date(0)
        return bTime.getTime() - aTime.getTime()
      })
      setRecentUpdates(updates.slice(0, 10))
      setLoading(false)
    })

    return () => {
      unsubProject()
      unsubWorkstreams()
    }
  }, [user, projectId])

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
    }
    return styles[status as keyof typeof styles] || styles.active
  }

  const getPriorityColor = (priority: string) => {
    const colors = {
      high: 'border-l-red-500',
      medium: 'border-l-yellow-500',
      low: 'border-l-green-500',
      debug: 'border-l-gray-400'
    }
    return colors[priority as keyof typeof colors] || colors.medium
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-medium text-gray-900 dark:text-white">
          Project not found
        </h2>
        <Link to="/" className="mt-4 text-blue-600 hover:underline">
          Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {project.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last activity: {formatRelativeTime(project.lastActivityAt)}
            </p>
          </div>
        </div>

        {/* GitHub Link */}
        <a
          href={`https://github.com/${project.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          GitHub
        </a>
      </div>

      {/* Project Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Project Status
          </h2>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            {workstreams.length} branch{workstreams.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {/* AI Summary placeholder */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-400 italic">
            {recentUpdates.length > 0 ? (
              <>Recent work: {recentUpdates.slice(0, 3).map(u =>
                u.summary
                  .split('\n')[0]  // First line only
                  .replace(/^\[[a-f0-9]+\]\s*/i, '')  // Remove commit hash prefix
                  .trim()
              ).filter(Boolean).join('. ')}</>
            ) : (
              'No recent activity. Updates will appear here as commits come in.'
            )}
          </p>
        </div>

        {/* Quick stats */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Updates today:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {recentUpdates.filter(u => {
                const date = u.timestamp?.toDate?.() || new Date(0)
                const today = new Date()
                return date.toDateString() === today.toDateString()
              }).length}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">This week:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {recentUpdates.filter(u => {
                const date = u.timestamp?.toDate?.() || new Date(0)
                const weekAgo = new Date()
                weekAgo.setDate(weekAgo.getDate() - 7)
                return date >= weekAgo
              }).length}
            </span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Workstreams */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Branches
          </h2>

          {workstreams.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No branches yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workstreams.map((workstream) => (
                <Link
                  key={workstream.id}
                  to={`/projects/${projectId}/workstreams/${workstream.id}`}
                  className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {workstream.name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusBadge(workstream.status)}`}>
                        {workstream.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(workstream.lastActivityAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h2>

          {recentUpdates.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No activity yet.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentUpdates.slice(0, 8).map((update) => (
                  <div
                    key={update.id}
                    className={`px-4 py-3 border-l-4 ${getPriorityColor(update.priority)}`}
                  >
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">
                      {update.summary.split('\n')[0]}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium">{update.workstreamName}</span>
                      <span>·</span>
                      <span>{update.tool}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(update.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
