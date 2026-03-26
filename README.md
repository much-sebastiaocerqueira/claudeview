<h1 align="center">ClaudeView</h1>

<p align="center">
  <em>A real-time control center for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> and <a href="https://github.com/openai/codex">Codex</a> sessions.</em>
</p>

<p align="center">
  <a href="https://github.com/much-sebastiaocerqueira/claudeview/releases">Download</a> · <a href="https://github.com/much-sebastiaocerqueira/claudeview">Source</a>
</p>

---

ClaudeView reads the JSONL session files that Claude Code and Codex write to disk and turns them into a live, interactive dashboard — so you can watch, control, and debug your AI agents without leaving your workflow. Start sessions with either provider, switch between them, and manage everything from one place.

> **Fork notice:** ClaudeView is a fork of [Cogpit](https://github.com/gentritbiba/cogpit) by Gentrit Biba. This fork is independently maintained.

Available as a **desktop app** (macOS, Linux) or a **browser-based** dev server.

## Download

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `ClaudeView-x.x.x-arm64.dmg` |
| macOS (Intel) | `ClaudeView-x.x.x.dmg` |
| Linux (AppImage) | `ClaudeView-x.x.x.AppImage` |
| Linux (Debian/Ubuntu) | `ClaudeView-x.x.x.deb` |
| Linux (Arch) | `ClaudeView-x.x.x.pacman` |

> **Prerequisite:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and/or [Codex](https://github.com/openai/codex) must be installed. ClaudeView uses your existing CLIs — no API keys or separate login needed.

## Why ClaudeView

Claude Code and Codex are powerful, but the terminal gives you a narrow view. ClaudeView gives you the full picture:

- **See everything at once** — live sessions, token costs, file changes, and agent activity in one screen
- **Talk to your agents** — send messages, approve plans, answer questions, interrupt or branch at any point
- **Track the money** — per-turn token breakdown, model-aware cost calculation, API rate limit monitoring
- **Debug faster** — full-text search across all sessions, color-coded tool calls, expandable thinking blocks, line-by-line edit diffs
- **Manage multi-agent workflows** — team dashboards with kanban boards, inter-agent messaging, and per-member session navigation
- **Undo anything** — rewind sessions to any turn with full branching support and file operation reversal

## Features

### Multi-Provider Support
Start sessions with Claude Code or Codex from the same interface. A provider dialog lets you pick your agent when creating a new session. Model and effort settings adapt per provider — Codex sessions expose xhigh effort and GPT models, while Claude sessions show Opus/Sonnet/Haiku. If a Codex model is unavailable, ClaudeView automatically retries with the default.

### Live Session Monitoring
Stream active sessions via SSE. Watch Claude or Codex think, call tools, and edit files in real-time. Status indicators show running, thinking, tool use, and idle states. Process monitor tracks all agent CLI processes with PID, memory, and CPU.

### Interactive Chat
Send messages to running sessions with model override (Opus, Sonnet, Haiku for Claude; GPT-5.4 and variants for Codex). Voice input via Whisper WASM. Slash command autocomplete from project skills and commands. Image support with drag-and-drop, paste, and format conversion.

### Conversation Timeline
Structured view of every turn: user messages, thinking blocks, assistant text with syntax-highlighted Markdown, color-coded tool call badges, LCS-based edit diffs, and compaction markers. Virtualized for smooth scrolling. Full-text search across all content.

### Sub-Agent Viewer
When Claude spawns sub-agents via the Task tool, ClaudeView tracks them automatically. Color-coded panels show each sub-agent's thinking, text, and tool calls inline within the parent session. Background agents get their own distinct panels. Click through to view any sub-agent's full session.

### Token Analytics & Cost Tracking
Per-turn token usage (input, output, cache creation, cache read). Model-aware pricing. SVG bar charts. Context window percentage with color coding. Tool call breakdown, error tracking, duration metrics, agent/model breakdowns, cache efficiency, and API rate limit widget.

### Undo / Redo with Branching
Rewind to any previous turn. Create branches, switch between them via an SVG graph modal. File operations (Edit/Write) are reversed on undo and replayed on redo. Ghost turns show archived content with hover-to-redo.

### File Changes
Track all modifications across a session. Net-diff view (aggregated) or per-edit view (chronological). Sub-agent attribution. Open files in your editor or view git diffs directly.

### Team Dashboards
Inspect multi-agent teams: member status cards, kanban task board, color-coded message timeline, team chat, and live SSE updates.

### Worktree Management
List active git worktrees with dirty/clean status, commits-ahead count, and linked sessions. Create PRs directly. Bulk cleanup of stale worktrees.

### Permissions & MCP Server Selector
Configure permission modes (bypass, default, plan, acceptEdits, dontAsk, delegate) and tool-level allow/block. Choose which MCP servers to enable per session from a searchable selector — toggle servers on or off before sending a message.

### Agent Configuration Editor
Browse and edit your project's `.claude/` directory directly from the dashboard — skills, slash commands, CLAUDE.md, and MCP server configs. Changes are written to disk immediately, no terminal needed.

### Network Access
Access ClaudeView from your phone or tablet on the same LAN. Password-protected with rate-limited auth. Full feature parity with the local client.

### Theming
Dark, Deep OLED, and Light themes with a Malewicz-inspired elevation system, glassmorphism effects, and gradient borders.

## Getting Started

### From Releases (recommended)

Download from the [Releases page](https://github.com/much-sebastiaocerqueira/claudeview/releases) and open.

### From Source

```bash
git clone https://github.com/much-sebastiaocerqueira/claudeview.git
cd claudeview
bun install

# Browser
bun run dev

# Electron
bun run electron:dev
```

### Build

```bash
# Web
bun run build && bun run preview

# Desktop (DMG on macOS, AppImage + deb on Linux)
bun run electron:package
```

## Tech Stack

React 19 · TypeScript · Vite 6 · Electron 40 · Tailwind CSS 4 · Radix UI · Express 5 · SSE + WebSocket · Shiki · Vitest

## License

MIT
