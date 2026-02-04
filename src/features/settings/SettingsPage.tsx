import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { Spinner } from '../../components/Spinner'

type AIProvider = 'anthropic' | 'openai' | 'google'

interface UserSettings {
  activityPaused: boolean
  pausedAt?: Date
}

interface AISettings {
  aiProvider?: AIProvider
  anthropicKey?: string
  openaiKey?: string
  googleKey?: string
}

export function SettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({ activityPaused: false })
  const [aiSettings, setAISettings] = useState<AISettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAI, setSavingAI] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) return

    const loadSettings = async () => {
      const [prefsSnap, aiSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid, 'settings', 'preferences')),
        getDoc(doc(db, 'users', user.uid, 'settings', 'ai'))
      ])

      if (prefsSnap.exists()) {
        setSettings(prefsSnap.data() as UserSettings)
      }
      if (aiSnap.exists()) {
        setAISettings(aiSnap.data() as AISettings)
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
      await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), newSettings, { merge: true })
      setSettings(newSettings)
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const saveAISettings = async () => {
    if (!user) return

    setSavingAI(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'ai'), aiSettings, { merge: true })
    } catch (error) {
      console.error('Error saving AI settings:', error)
    } finally {
      setSavingAI(false)
    }
  }

  const updateAISetting = (key: keyof AISettings, value: string) => {
    setAISettings(prev => ({ ...prev, [key]: value || undefined }))
  }

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const maskKey = (key: string | undefined) => {
    if (!key) return ''
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••••••' + key.slice(-4)
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

      {/* AI Provider Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            AI Summaries
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Configure which AI provider generates project summaries. Your API keys are stored securely in your account.
          </p>

          {/* Provider Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Provider
            </label>
            <select
              value={aiSettings.aiProvider || 'anthropic'}
              onChange={(e) => updateAISetting('aiProvider', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="anthropic">Anthropic (Claude Haiku)</option>
              <option value="openai">OpenAI (GPT-4o mini)</option>
              <option value="google">Google (Gemini 1.5 Flash)</option>
            </select>
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            {/* Anthropic Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Anthropic API Key
                {aiSettings.aiProvider === 'anthropic' && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(active)</span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKeys.anthropic ? 'text' : 'password'}
                    value={aiSettings.anthropicKey || ''}
                    onChange={(e) => updateAISetting('anthropicKey', e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('anthropic')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showKeys.anthropic ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.anthropic.com</a>
              </p>
            </div>

            {/* OpenAI Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                OpenAI API Key
                {aiSettings.aiProvider === 'openai' && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(active)</span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKeys.openai ? 'text' : 'password'}
                    value={aiSettings.openaiKey || ''}
                    onChange={(e) => updateAISetting('openaiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('openai')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showKeys.openai ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>
              </p>
            </div>

            {/* Google Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Google AI API Key
                {aiSettings.aiProvider === 'google' && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(active)</span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKeys.google ? 'text' : 'password'}
                    value={aiSettings.googleKey || ''}
                    onChange={(e) => updateAISetting('googleKey', e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('google')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showKeys.google ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">aistudio.google.com</a>
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={saveAISettings}
              disabled={savingAI}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingAI ? 'Saving...' : 'Save AI Settings'}
            </button>
          </div>
        </div>
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
                When paused, agents will not be able to post updates.
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
          {settings.activityPaused ? (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-red-800 dark:text-red-200">
                  Activity tracking is paused
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-green-800 dark:text-green-200">
                  Activity tracking is active
                </span>
              </div>
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
