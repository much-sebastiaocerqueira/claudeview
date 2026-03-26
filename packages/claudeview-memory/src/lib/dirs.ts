import { join } from "node:path"
import { homedir } from "node:os"

export const dirs = {
  PROJECTS_DIR: join(homedir(), ".claude", "projects"),
  TEAMS_DIR: join(homedir(), ".claude", "teams"),
  TASKS_DIR: join(homedir(), ".claude", "tasks"),
}

/** Default database path for the FTS5 search index. */
export const DEFAULT_DB_PATH = join(homedir(), ".claude", "claudeview-memory", "search-index.db")
