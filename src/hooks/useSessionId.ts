import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'askmydocs_session_id'

// Fallback for browsers where localStorage is blocked (private mode, strict
// settings): the session then lasts for the page's lifetime instead of crashing.
let memoryId: string | null = null

function readOrCreateId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing

    const id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID()
    return memoryId
  }
}

// The id never changes while the page is open, so there is nothing to subscribe to.
const subscribe = () => () => {}

// The server has no browser storage, so it renders with an empty id and the
// client swaps in the real one after hydration. This avoids a hydration mismatch.
const getServerSnapshot = () => ''

export function useSessionId(): string {
  return useSyncExternalStore(subscribe, readOrCreateId, getServerSnapshot)
}