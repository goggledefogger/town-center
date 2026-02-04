import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  getDocs
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { Project, Update } from '../../types'
import { Spinner } from '../../components/Spinner'

interface ProjectWithActivity extends Project {
  recentUpdates: Update[]
  workstreamCount: number
}

export function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<ProjectWithActivity[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch projects
  useEffect(() => {
    if (!user) return

    const projectsRef = collection(db, 'users', user.uid, 'projects')
    const q = query(projectsRef, orderBy('lastActivityAt', 'desc'))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const projectList: ProjectWithActivity[] = []

      for (const docSnap of snapshot.docs) {
        const projectData = { id: docSnap.id, ...docSnap.data() } as Project

        // Get workstream count and recent updates for this project
        const workstreamsRef = collection(docSnap.ref, 'workstreams')
        const workstreamsQuery = query(workstreamsRef, orderBy('lastActivityAt', 'desc'), limit(5))
        const workstreamsSnap = await getDocs(workstreamsQuery)

        const recentUpdates: Update[] = []
        for (const wsDoc of workstreamsSnap.docs) {
          const updatesRef = collection(wsDoc.ref, 'updates')
          const updatesQuery = query(updatesRef, orderBy('timestamp', 'desc'), limit(2))
          const updatesSnap = await getDocs(updatesQuery)
          updatesSnap.docs.forEach(uDoc => {
            recentUpdates.push({ id: uDoc.id, ...uDoc.data() } as Update)
          })
        }

        // Sort by timestamp and take top 3
        recentUpdates.sort((a, b) => {
          const aTime = a.timestamp?.toDate?.() || new Date(0)
          const bTime = b.timestamp?.toDate?.() || new Date(0)
          return bTime.getTime() - aTime.getTime()
        })

        projectList.push({
          ...projectData,
          recentUpdates: recentUpdates.slice(0, 3),
          workstreamCount: workstreamsSnap.size
        })
      }

      setProjects(projectList)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [user])

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

  const getPriorityColor = (priority: string) => {
    const colors = {
      high: 'border-l-red-500',
      medium: 'border-l-yellow-500',
      low: 'border-l-green-500',
      debug: 'border-l-gray-400'
    }
    return colors[priority as keyof typeof colors] || colors.medium
  }

  const truncateSummary = (summary: string, maxLength: number = 120) => {
    if (summary.length <= maxLength) return summary
    return summary.substring(0, maxLength).trim() + '...'
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <h2 className="mt-4 text-xl font-medium text-gray-900 dark:text-white">
          No projects yet
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Projects will appear here automatically when your AI agents start posting updates.
        </p>
        <Link
          to="/tokens"
          className="inline-block mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create an Agent Token
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Projects
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Activity from your AI development agents
        </p>
      </div>

      <div className="space-y-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
          >
            {/* Project Header */}
            <Link
              to={`/projects/${project.id}`}
              className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {project.workstreamCount} workstream{project.workstreamCount !== 1 ? 's' : ''} · {formatRelativeTime(project.lastActivityAt)}
                    </p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* Recent Updates */}
            {project.recentUpdates.length > 0 && (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {project.recentUpdates.map((update) => (
                  <div
                    key={update.id}
                    className={`px-4 py-3 border-l-4 ${getPriorityColor(update.priority)}`}
                  >
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {truncateSummary(update.summary)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{update.tool}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(update.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
