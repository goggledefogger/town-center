import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  collection,
  doc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { Project, Workstream } from '../../types'
import { Spinner } from '../../components/Spinner'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
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
    const unsubWorkstreams = onSnapshot(q, (snapshot) => {
      const list: Workstream[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Workstream))
      setWorkstreams(list)
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

      {/* Workstreams */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Workstreams
        </h2>

        {workstreams.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              No workstreams yet. They'll appear when agents post updates.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {workstreams.map((workstream) => (
              <Link
                key={workstream.id}
                to={`/projects/${projectId}/workstreams/${workstream.id}`}
                className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {workstream.name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(workstream.status)}`}>
                          {workstream.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(workstream.lastActivityAt)}
                      </p>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
