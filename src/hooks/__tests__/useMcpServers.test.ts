import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useMcpServers } from "../useMcpServers"

// Mock authFetch
vi.mock("@/lib/auth", () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from "@/lib/auth"

const mockFetch = authFetch as unknown as ReturnType<typeof vi.fn>

const MOCK_CONFIGS = {
  clickup: { command: "npx", args: ["-y", "mcp-clickup"] },
  figma: { command: "npx", args: ["-y", "@figma/mcp"] },
  gmail: { command: "npx", args: ["-y", "mcp-gmail"] },
  broken: { command: "npx", args: ["-y", "mcp-broken"] },
}

describe("useMcpServers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("fetches servers and auto-selects connected ones", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "gmail", status: "needs_auth" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    expect(result.current.selectedServers).toEqual(["clickup"])
  })

  it("persists selection to localStorage", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    act(() => result.current.toggleServer("figma"))
    expect(result.current.selectedServers).toEqual(["clickup"])

    const stored = JSON.parse(localStorage.getItem("cogpit:mcpSelection:test-dir") || "null")
    expect(stored).toEqual(["clickup"])
  })

  it("loads saved selection from localStorage", async () => {
    localStorage.setItem("cogpit:mcpSelection:test-dir", JSON.stringify(["figma"]))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    expect(result.current.selectedServers).toEqual(["figma"])
  })

  it("returns mcpConfigJson with only selected server configs", async () => {
    localStorage.setItem("cogpit:mcpSelection:test-dir", JSON.stringify(["clickup"]))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    // Only clickup selected, so mcpConfigJson should include only clickup config
    const parsed = JSON.parse(result.current.mcpConfigJson!)
    expect(parsed.mcpServers).toHaveProperty("clickup")
    expect(parsed.mcpServers).not.toHaveProperty("figma")
  })

  it("returns null mcpConfigJson when all connected servers are selected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    // All connected servers auto-selected → null (use default config)
    expect(result.current.mcpConfigJson).toBeNull()
  })

  it("returns empty mcpServers config when 0 selected", async () => {
    localStorage.setItem("cogpit:mcpSelection:test-dir", JSON.stringify([]))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    const parsed = JSON.parse(result.current.mcpConfigJson!)
    expect(parsed.mcpServers).toEqual({})
  })

  it("returns initial empty state", () => {
    const { result } = renderHook(() => useMcpServers(undefined, undefined, undefined))

    expect(result.current.servers).toEqual([])
    expect(result.current.selectedServers).toEqual([])
    expect(result.current.mcpConfigJson).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.loaded).toBe(false)
    expect(typeof result.current.toggleServer).toBe("function")
    expect(typeof result.current.refresh).toBe("function")
  })

  it("sets loaded=true after fetch completes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [{ name: "clickup", status: "connected" }],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))
    expect(result.current.loaded).toBe(false)

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.servers.length).toBe(1)
  })

  it("sets loaded=true even on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.servers).toEqual([])
  })

  it("does not fetch when cwd is undefined", () => {
    renderHook(() => useMcpServers(undefined, "test-dir", undefined))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("toggleServer adds a server when not selected", async () => {
    localStorage.setItem("cogpit:mcpSelection:test-dir", JSON.stringify(["clickup"]))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "connected" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    expect(result.current.selectedServers).toEqual(["clickup"])

    act(() => result.current.toggleServer("figma"))
    expect(result.current.selectedServers).toEqual(["clickup", "figma"])
  })

  it("refresh calls API with refresh=1 param", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [{ name: "clickup", status: "connected" }],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(1)
    })

    act(() => result.current.refresh())

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    const refreshCallUrl = mockFetch.mock.calls[1][0] as string
    expect(refreshCallUrl).toContain("refresh=1")
  })

  it("filters out saved servers that are no longer connected", async () => {
    localStorage.setItem("cogpit:mcpSelection:test-dir", JSON.stringify(["clickup", "figma"]))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "clickup", status: "connected" },
          { name: "figma", status: "error" },
        ],
        configs: MOCK_CONFIGS,
      }),
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.servers.length).toBe(2)
    })

    expect(result.current.selectedServers).toEqual(["clickup"])
  })

  it("handles API error gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.servers).toEqual([])
    expect(result.current.selectedServers).toEqual([])
  })

  it("handles non-ok response gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useMcpServers("/test/path", "test-dir", undefined))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.servers).toEqual([])
  })
})
