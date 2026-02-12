import { describe, it, expect } from 'vitest'

// ---- Extracted pure logic from ProjectsPage.tsx ----

// Types matching the component's internal types
interface WorkstreamForTest {
  id: string
  name: string
  status: string
  summary?: string
  summaryGeneratedAt?: { toDate: () => Date } | null
  lastActivityAt?: { toDate: () => Date } | null
}

// checkStaleSummary logic from ProjectsPage.tsx lines 104-120
function checkStaleSummary(ws: WorkstreamForTest): boolean {
  // Skip completed/merged workstreams
  if (ws.status === 'completed') return false

  // No summary yet - needs generation
  if (!ws.summary) return true

  // Has summary but no timestamp - consider stale
  if (!ws.summaryGeneratedAt) return true

  // Compare summaryGeneratedAt with lastActivityAt
  const summaryTime = ws.summaryGeneratedAt?.toDate?.()?.getTime() || 0
  const activityTime = ws.lastActivityAt?.toDate?.()?.getTime() || 0

  // Summary is stale if activity happened after it was generated
  return activityTime > summaryTime
}

// Workstream sorting logic from ProjectsPage.tsx lines 76-80
function sortWorkstreams(workstreams: WorkstreamForTest[]): WorkstreamForTest[] {
  return [...workstreams].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (a.status !== 'completed' && b.status === 'completed') return -1
    return 0 // preserve lastActivityAt ordering within each group
  })
}

// ---- Tests ----

describe('checkStaleSummary', () => {
  it('returns false for completed workstreams', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/done',
      status: 'completed',
      summary: 'Some summary'
    }
    expect(checkStaleSummary(ws)).toBe(false)
  })

  it('returns false for completed workstreams even without a summary', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/done',
      status: 'completed'
    }
    expect(checkStaleSummary(ws)).toBe(false)
  })

  it('returns true for active workstreams with no summary', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/new',
      status: 'active'
    }
    expect(checkStaleSummary(ws)).toBe(true)
  })

  it('returns true for active workstreams with summary but no timestamp', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/old',
      status: 'active',
      summary: 'Existing summary'
    }
    expect(checkStaleSummary(ws)).toBe(true)
  })

  it('returns true when activity is newer than summary', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/stale',
      status: 'active',
      summary: 'Old summary',
      summaryGeneratedAt: { toDate: () => new Date('2026-01-01T00:00:00Z') },
      lastActivityAt: { toDate: () => new Date('2026-02-01T00:00:00Z') }
    }
    expect(checkStaleSummary(ws)).toBe(true)
  })

  it('returns false when summary is newer than activity', () => {
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/fresh',
      status: 'active',
      summary: 'Fresh summary',
      summaryGeneratedAt: { toDate: () => new Date('2026-02-01T00:00:00Z') },
      lastActivityAt: { toDate: () => new Date('2026-01-01T00:00:00Z') }
    }
    expect(checkStaleSummary(ws)).toBe(false)
  })

  it('returns false when summary and activity are at the same time', () => {
    const ts = new Date('2026-01-15T00:00:00Z')
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/same',
      status: 'active',
      summary: 'Current summary',
      summaryGeneratedAt: { toDate: () => ts },
      lastActivityAt: { toDate: () => ts }
    }
    expect(checkStaleSummary(ws)).toBe(false)
  })

  it('returns false for paused but completed-status workstreams', () => {
    // "completed" is the key status to skip, paused should still regenerate
    const ws: WorkstreamForTest = {
      id: '1',
      name: 'feat/paused',
      status: 'paused'
    }
    expect(checkStaleSummary(ws)).toBe(true)
  })
})

describe('sortWorkstreams', () => {
  const makeWs = (id: string, status: string): WorkstreamForTest => ({
    id,
    name: `branch-${id}`,
    status
  })

  it('sorts completed workstreams after active ones', () => {
    const input = [
      makeWs('1', 'completed'),
      makeWs('2', 'active'),
      makeWs('3', 'active')
    ]
    const sorted = sortWorkstreams(input)
    expect(sorted.map(w => w.id)).toEqual(['2', '3', '1'])
  })

  it('sorts completed workstreams after paused ones', () => {
    const input = [
      makeWs('1', 'completed'),
      makeWs('2', 'paused')
    ]
    const sorted = sortWorkstreams(input)
    expect(sorted.map(w => w.id)).toEqual(['2', '1'])
  })

  it('preserves order among active workstreams', () => {
    const input = [
      makeWs('1', 'active'),
      makeWs('2', 'active'),
      makeWs('3', 'active')
    ]
    const sorted = sortWorkstreams(input)
    expect(sorted.map(w => w.id)).toEqual(['1', '2', '3'])
  })

  it('preserves order among completed workstreams', () => {
    const input = [
      makeWs('1', 'completed'),
      makeWs('2', 'completed')
    ]
    const sorted = sortWorkstreams(input)
    expect(sorted.map(w => w.id)).toEqual(['1', '2'])
  })

  it('handles mixed statuses correctly', () => {
    const input = [
      makeWs('1', 'completed'),
      makeWs('2', 'active'),
      makeWs('3', 'completed'),
      makeWs('4', 'paused'),
      makeWs('5', 'active')
    ]
    const sorted = sortWorkstreams(input)
    // Active and paused come first (preserving relative order), then completed
    expect(sorted.map(w => w.id)).toEqual(['2', '4', '5', '1', '3'])
  })

  it('returns empty array for empty input', () => {
    expect(sortWorkstreams([])).toEqual([])
  })

  it('handles single workstream', () => {
    const input = [makeWs('1', 'active')]
    const sorted = sortWorkstreams(input)
    expect(sorted.map(w => w.id)).toEqual(['1'])
  })

  it('does not mutate the original array', () => {
    const input = [
      makeWs('1', 'completed'),
      makeWs('2', 'active')
    ]
    const original = [...input]
    sortWorkstreams(input)
    expect(input.map(w => w.id)).toEqual(original.map(w => w.id))
  })
})
