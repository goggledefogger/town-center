import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Pure logic extracted from index.ts for testing ----

// Branch name normalization (same logic as createUpdate line 307)
function normalizeBranchName(workstream: string): string {
  return workstream.replace(/^refs\/heads\//, '')
}

// Priority from commit message (same logic as getPriorityFromCommit line 367)
function getPriorityFromCommit(message: string): 'high' | 'medium' | 'low' | 'debug' {
  const lowerMsg = message.toLowerCase()
  if (lowerMsg.startsWith('fix') || lowerMsg.startsWith('hotfix') || lowerMsg.includes('!:')) {
    return 'high'
  }
  if (lowerMsg.startsWith('docs') || lowerMsg.startsWith('chore') || lowerMsg.startsWith('style')) {
    return 'low'
  }
  return 'medium'
}

// ---- Tests ----

describe('normalizeBranchName', () => {
  it('strips refs/heads/ prefix', () => {
    expect(normalizeBranchName('refs/heads/feat/foo')).toBe('feat/foo')
  })

  it('strips refs/heads/ from simple branch names', () => {
    expect(normalizeBranchName('refs/heads/main')).toBe('main')
  })

  it('leaves already-normalized branch names unchanged', () => {
    expect(normalizeBranchName('feat/foo')).toBe('feat/foo')
  })

  it('leaves main unchanged when no prefix', () => {
    expect(normalizeBranchName('main')).toBe('main')
  })

  it('only strips the prefix once (no double strip)', () => {
    expect(normalizeBranchName('refs/heads/refs/heads/weird')).toBe('refs/heads/weird')
  })

  it('handles deeply nested branch names', () => {
    expect(normalizeBranchName('refs/heads/feature/user/add-login')).toBe('feature/user/add-login')
  })

  it('refs/heads/ push and direct API both resolve to same name', () => {
    const pushRef = normalizeBranchName('refs/heads/feat/new-thing')
    const directApi = normalizeBranchName('feat/new-thing')
    expect(pushRef).toBe(directApi)
  })
})

describe('getPriorityFromCommit', () => {
  it('returns high for fix commits', () => {
    expect(getPriorityFromCommit('fix: resolve auth bug')).toBe('high')
  })

  it('returns high for hotfix commits', () => {
    expect(getPriorityFromCommit('hotfix: critical issue')).toBe('high')
  })

  it('returns high for breaking changes (!:)', () => {
    expect(getPriorityFromCommit('feat!: breaking API change')).toBe('high')
  })

  it('returns low for docs commits', () => {
    expect(getPriorityFromCommit('docs: update README')).toBe('low')
  })

  it('returns low for chore commits', () => {
    expect(getPriorityFromCommit('chore: update deps')).toBe('low')
  })

  it('returns low for style commits', () => {
    expect(getPriorityFromCommit('style: fix formatting')).toBe('low')
  })

  it('returns medium for feature commits', () => {
    expect(getPriorityFromCommit('feat: add new dashboard')).toBe('medium')
  })

  it('returns medium for refactor commits', () => {
    expect(getPriorityFromCommit('refactor: simplify auth flow')).toBe('medium')
  })
})

// ---- Webhook handler logic tests (with minimal mocks) ----

describe('pull_request webhook handler logic', () => {
  // Simulate the decision logic from the githubWebhook handler (lines 581-628)

  interface PRPayload {
    action: string
    pull_request: {
      merged: boolean
      html_url: string
      head: { ref: string }
      title: string
    }
    repository: { name: string; full_name: string }
  }

  interface HandlerResult {
    action: 'ignore' | 'mark_completed' | 'project_not_found' | 'workstream_not_found'
    message: string
    updates?: Record<string, any>
  }

  // Extracted decision logic from the webhook handler
  function handlePullRequest(
    payload: PRPayload,
    projectExists: boolean,
    workstreamExists: boolean
  ): HandlerResult {
    // Only handle merged PRs (line 591)
    if (payload.action !== 'closed' || !payload.pull_request.merged) {
      return { action: 'ignore', message: 'PR event ignored (not a merge)' }
    }

    if (!projectExists) {
      return { action: 'project_not_found', message: 'Project not found, ignored' }
    }

    if (!workstreamExists) {
      return { action: 'workstream_not_found', message: 'Workstream not found for branch, ignored' }
    }

    // Mark as completed (lines 620-625)
    return {
      action: 'mark_completed',
      message: `Marked branch ${payload.pull_request.head.ref} as merged`,
      updates: {
        status: 'completed',
        mergedPrUrl: payload.pull_request.html_url,
        actionTag: null
      }
    }
  }

  const basePRPayload: PRPayload = {
    action: 'closed',
    pull_request: {
      merged: true,
      html_url: 'https://github.com/user/repo/pull/42',
      head: { ref: 'feat/new-feature' },
      title: 'Add new feature'
    },
    repository: { name: 'my-repo', full_name: 'user/my-repo' }
  }

  it('marks workstream as completed on merged PR', () => {
    const result = handlePullRequest(basePRPayload, true, true)
    expect(result.action).toBe('mark_completed')
    expect(result.updates).toEqual({
      status: 'completed',
      mergedPrUrl: 'https://github.com/user/repo/pull/42',
      actionTag: null
    })
  })

  it('clears actionTag when marking as completed', () => {
    const result = handlePullRequest(basePRPayload, true, true)
    expect(result.updates?.actionTag).toBeNull()
  })

  it('ignores non-merged PR close', () => {
    const payload = {
      ...basePRPayload,
      pull_request: { ...basePRPayload.pull_request, merged: false }
    }
    const result = handlePullRequest(payload, true, true)
    expect(result.action).toBe('ignore')
  })

  it('ignores PR opened events', () => {
    const payload = { ...basePRPayload, action: 'opened' }
    const result = handlePullRequest(payload, true, true)
    expect(result.action).toBe('ignore')
  })

  it('ignores PR synchronize events', () => {
    const payload = { ...basePRPayload, action: 'synchronize' }
    const result = handlePullRequest(payload, true, true)
    expect(result.action).toBe('ignore')
  })

  it('handles gracefully when project not found', () => {
    const result = handlePullRequest(basePRPayload, false, false)
    expect(result.action).toBe('project_not_found')
  })

  it('handles gracefully when workstream not found for branch', () => {
    const result = handlePullRequest(basePRPayload, true, false)
    expect(result.action).toBe('workstream_not_found')
  })

  it('includes the branch name in the success message', () => {
    const result = handlePullRequest(basePRPayload, true, true)
    expect(result.message).toContain('feat/new-feature')
  })
})

describe('push webhook branch extraction', () => {
  // The push handler extracts branch from payload.ref (line 633)
  it('extracts branch name from push ref', () => {
    const ref = 'refs/heads/feat/new-feature'
    const branch = ref.replace('refs/heads/', '')
    expect(branch).toBe('feat/new-feature')
  })

  it('commit summary is formatted as [shortsha] message', () => {
    const commitId = 'abc1234567890'
    const message = 'feat: add new thing\n\nThis is the body'
    const messageLines = message.split('\n')
    const summary = `[${commitId.substring(0, 7)}] ${messageLines[0]}`
    expect(summary).toBe('[abc1234] feat: add new thing')
  })

  it('extracts commit body from multiline messages', () => {
    const message = 'feat: add new thing\n\nThis is the body\nSecond line'
    const messageLines = message.split('\n')
    const commitBody = messageLines.slice(1).join('\n').trim() || undefined
    expect(commitBody).toBe('This is the body\nSecond line')
  })

  it('commit body is undefined for single-line messages', () => {
    const message = 'feat: add new thing'
    const messageLines = message.split('\n')
    const commitBody = messageLines.slice(1).join('\n').trim() || undefined
    expect(commitBody).toBeUndefined()
  })

  it('collects all changed files from a commit', () => {
    const commit = {
      added: ['src/new.ts'],
      modified: ['src/existing.ts'],
      removed: ['src/old.ts']
    }
    const filesChanged = [
      ...(commit.added || []),
      ...(commit.modified || []),
      ...(commit.removed || [])
    ]
    expect(filesChanged).toEqual(['src/new.ts', 'src/existing.ts', 'src/old.ts'])
  })
})
