/**
 * Panel/sidebar toggle state for the App shell.
 */

import { useState, useCallback, useEffect } from "react"
import type { SessionState, SessionAction } from "./useSessionState"

const PANEL_STORAGE_KEY = "claudeview:panel-state"

interface PersistedPanels {
  showSidebar: boolean
  showStats: boolean
  showFileChanges: boolean
}

function loadPanelState(): PersistedPanels {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { showSidebar: true, showStats: false, showFileChanges: true }
}

function savePanelState(s: PersistedPanels): void {
  try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

interface PanelState {
  showSidebar: boolean
  showStats: boolean
  showWorktrees: boolean
  showFileChanges: boolean
  showProjectSwitcher: boolean
  showThemeSelector: boolean

  handleToggleSidebar: () => void
  handleToggleStats: () => void
  handleToggleWorktrees: () => void
  handleToggleFileChanges: () => void
  handleToggleConfig: () => void
  handleEditConfig: (filePath: string) => void
  handleOpenProjectSwitcher: () => void
  handleCloseProjectSwitcher: () => void
  handleToggleThemeSelector: () => void
  handleCloseThemeSelector: () => void

  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>
  setShowWorktrees: React.Dispatch<React.SetStateAction<boolean>>
  setShowFileChanges: React.Dispatch<React.SetStateAction<boolean>>
}

export function usePanelState(
  state: SessionState,
  dispatch: React.Dispatch<SessionAction>,
): PanelState {
  const [persisted] = useState(loadPanelState)
  const [showSidebar, setShowSidebar] = useState(persisted.showSidebar)
  const [showStats, setShowStats] = useState(persisted.showStats)
  const [showWorktrees, setShowWorktrees] = useState(false)
  const [showFileChanges, setShowFileChanges] = useState(persisted.showFileChanges)
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false)
  const [showThemeSelector, setShowThemeSelector] = useState(false)

  // Persist panel toggle state to localStorage
  useEffect(() => {
    savePanelState({ showSidebar, showStats, showFileChanges })
  }, [showSidebar, showStats, showFileChanges])

  const handleToggleSidebar = useCallback(() => setShowSidebar((p) => !p), [])
  const handleToggleStats = useCallback(() => setShowStats((p) => !p), [])
  const handleToggleWorktrees = useCallback(() => setShowWorktrees((p) => !p), [])
  const handleToggleFileChanges = useCallback(() => setShowFileChanges((p) => !p), [])
  const handleToggleConfig = useCallback(() => {
    if (state.mainView === "config") {
      dispatch({ type: "CLOSE_CONFIG" })
    } else {
      dispatch({ type: "OPEN_CONFIG" })
    }
  }, [state.mainView, dispatch])
  const handleEditConfig = useCallback((filePath: string) => {
    dispatch({ type: "OPEN_CONFIG", filePath })
  }, [dispatch])
  const handleOpenProjectSwitcher = useCallback(() => setShowProjectSwitcher(true), [])
  const handleCloseProjectSwitcher = useCallback(() => setShowProjectSwitcher(false), [])
  const handleToggleThemeSelector = useCallback(() => setShowThemeSelector((p) => !p), [])
  const handleCloseThemeSelector = useCallback(() => setShowThemeSelector(false), [])

  return {
    showSidebar,
    showStats,
    showWorktrees,
    showFileChanges,
    showProjectSwitcher,
    showThemeSelector,
    handleToggleSidebar,
    handleToggleStats,
    handleToggleWorktrees,
    handleToggleFileChanges,
    handleToggleConfig,
    handleEditConfig,
    handleOpenProjectSwitcher,
    handleCloseProjectSwitcher,
    handleToggleThemeSelector,
    handleCloseThemeSelector,
    setShowSidebar,
    setShowWorktrees,
    setShowFileChanges,
  }
}
