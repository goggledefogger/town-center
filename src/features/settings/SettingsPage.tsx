import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { Spinner } from '../../components/Spinner'

interface UserSettings {
  activityPaused: boolean
  pausedAt?: Date
}

export function SettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({ activityPaused: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return

    const loadSettings = async () => {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences')
      const settingsSnap = await getDoc(settingsRef)

      if (settingsSnap.exists()) {
        setSettings(settingsSnap.data() as UserSettings)
      }
      setLoading(false)
    }

    loadSettings()
  }, [user])

  const toggleActivityPaused = async () => {
    if (!user) return

    setSaving(true)
    const newValue = !settings.activityPaused
    const newSettings: UserSettings = {
      activityPaused: newValue,
      ...(newValue ? { pausedAt: new Date() } : {})
    }

    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences')
      await setDoc(settingsRef, newSettings, { merge: true })
      setSettings(newSettings)
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Configure your dashboard preferences
        </p>
      </div>

      {/* Activity Tracking Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Activity Tracking
          </h2>

          {/* Pause Toggle */}
          <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-white">
                Pause all activity tracking
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                When paused, agents will not be able to post updates. Use this for privacy,
                to reduce bandwidth, or when you don't need tracking.
              </p>
            </div>
            <button
              onClick={toggleActivityPaused}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                settings.activityPaused ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.activityPaused ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Status indicator */}
          {settings.activityPaused && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-red-800 dark:text-red-200">
                  Activity tracking is paused
                </span>
              </div>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                All agent updates are being rejected. Toggle off to resume tracking.
              </p>
            </div>
          )}

          {!settings.activityPaused && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-green-800 dark:text-green-200">
                  Activity tracking is active
                </span>
              </div>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                Agents can post updates to your dashboard.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>

          <div className="space-y-3">
            <a
              href="/tokens"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Manage Tokens</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Create or revoke agent tokens</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
