import { useCallback, useEffect, useState } from "react"
import { AuthPanel } from "./components/AuthPanel"
import SafetyDashboard from "./components/SafetyDashboard"
import * as api from "./lib/api"
import type { Snapshot } from "./types"

const POLL_MS = 4000

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [backendError, setBackendError] = useState("")

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.getSnapshot())
      setBackendError("")
    } catch (error) {
      const code = error instanceof api.ApiFailure ? error.code : ""
      setBackendError(
        code === "DATABASE_UNAVAILABLE"
          ? "Apache is running but MySQL is not reachable. Start MySQL in the XAMPP control panel and import lib/schema.sql."
          : "Cannot reach the PHP backend. Start Apache in XAMPP and check the plugguard-api folder is in htdocs.",
      )
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  // Live updates: re-fetch the dashboard every few seconds while signed in
  useEffect(() => {
    if (!snapshot) return
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [snapshot === null, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try {
      await api.logout()
    } finally {
      setSnapshot(null)
    }
  }

  if (loading) return <div className="pg-loading">Loading PlugGuard…</div>
  if (backendError && !snapshot) {
    return (
      <div className="pg-loading" style={{ flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
        <p style={{ maxWidth: 420 }}>{backendError}</p>
        <button className="pg-btn pg-btn--primary" type="button" onClick={() => refresh()}>
          Retry
        </button>
      </div>
    )
  }
  if (!snapshot) return <AuthPanel onAuthenticated={refresh} />
  return <SafetyDashboard snapshot={snapshot} onRefresh={refresh} onSignOut={signOut} />
}
