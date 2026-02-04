import { useState, useEffect } from 'react'
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { AgentToken } from '../../types'
import { Spinner } from '../../components/Spinner'

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function TokensPage() {
  const { user } = useAuth()
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTokenLabel, setNewTokenLabel] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const tokensRef = collection(db, 'users', user.uid, 'agentTokens')
    const q = query(
      tokensRef, 
      where('isRevoked', '==', false),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tokenList: AgentToken[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AgentToken))
      setTokens(tokenList)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [user])

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newTokenLabel.trim()) return

    setCreating(true)
    try {
      const token = generateToken()
      const tokensRef = collection(db, 'users', user.uid, 'agentTokens')
      await addDoc(tokensRef, {
        label: newTokenLabel.trim(),
        token,
        createdAt: serverTimestamp(),
        isRevoked: false
      })
      setNewlyCreatedToken(token)
      setNewTokenLabel('')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Error creating token:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeToken = async (tokenId: string) => {
    if (!user) return
    
    const confirmed = window.confirm('Are you sure you want to revoke this token? Agents using it will no longer be able to post updates.')
    if (!confirmed) return

    try {
      const tokenRef = doc(db, 'users', user.uid, 'agentTokens', tokenId)
      await updateDoc(tokenRef, {
        isRevoked: true,
        revokedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error revoking token:', error)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Never'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Agent Tokens
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Create tokens for your AI agents to post updates
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Token
          </button>
        )}
      </div>

      {/* Newly created token alert */}
      {newlyCreatedToken && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-green-800 dark:text-green-200">Token Created!</h3>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Copy this token now. You won't be able to see it again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-white dark:bg-gray-800 px-3 py-2 rounded border border-green-300 dark:border-green-700 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                  {newlyCreatedToken}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedToken, 'new')}
                  className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                >
                  {copiedId === 'new' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewlyCreatedToken(null)}
              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create token form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Create New Token
          </h2>
          <form onSubmit={handleCreateToken} className="space-y-4">
            <div>
              <label htmlFor="tokenLabel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Label
              </label>
              <input
                type="text"
                id="tokenLabel"
                value={newTokenLabel}
                onChange={(e) => setNewTokenLabel(e.target.value)}
                placeholder="e.g., Claude Code, Cursor, Windsurf"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                A descriptive name to identify which agent uses this token
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || !newTokenLabel.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating...' : 'Create Token'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setNewTokenLabel('')
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 && !showCreateForm ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No tokens yet
          </h3>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Create your first token to start receiving updates from your AI agents.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Token
          </button>
        </div>
      ) : tokens.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Label
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Used
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {token.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(token.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleRevokeToken(token.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage instructions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
          How to use tokens
        </h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            Configure your AI agent to send POST requests to the update endpoint with your token in the header:
          </p>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
{`curl -X POST https://YOUR_FUNCTION_URL/postUpdate \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Token: YOUR_TOKEN" \\
  -d '{
    "project": "my-project",
    "workstream": "feature-branch",
    "summary": "Completed API integration",
    "tool": "claude-code",
    "model": "claude-3-opus"
  }'`}
          </pre>
        </div>
      </div>
    </div>
  )
}
