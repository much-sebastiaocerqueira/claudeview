import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

vi.mock("@/lib/auth", () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from "@/lib/auth"
import { useFileTree } from "../useFileTree"
import type { GroupedFile } from "@/components/FileChangesPanel/useFileChangesData"

const mockedAuthFetch = vi.mocked(authFetch)

function mockTreeResponse(entries: Array<{ name: string; path: string; type: "file" | "dir"; gitStatus?: string | null }>, gitRoot = "/project") {
  mockedAuthFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ entries, gitRoot, truncated: false }),
  } as unknown as Response)
}

function makeGroupedFile(filePath: string, overrides: Partial<GroupedFile> = {}): GroupedFile {
  return {
    filePath,
    shortPath: filePath.split("/").slice(-3).join("/"),
    editCount: 1,
    turnRange: [0, 0] as [number, number],
    opTypes: ["Edit"] as ("Edit" | "Write")[],
    netOriginal: "",
    netCurrent: "",
    addCount: 3,
    delCount: 1,
    subAgentId: null,
    edits: [],
    netStartLine: 1,
    gitStatus: "M" as const,
    ...overrides,
  }
}

describe("useFileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty state when rootPath is null", () => {
    const { result } = renderHook(() => useFileTree(null, []))
    expect(result.current.flatNodes).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("fetches root directory on mount", async () => {
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
      { name: "README.md", path: "/project/README.md", type: "file", gitStatus: "M" },
    ])

    const { result } = renderHook(() => useFileTree("/project", []))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/directory-tree?path=%2Fproject"),
    )
    expect(result.current.flatNodes).toHaveLength(2)
    expect(result.current.flatNodes[0]).toMatchObject({
      name: "src",
      type: "dir",
      depth: 0,
    })
    expect(result.current.flatNodes[1]).toMatchObject({
      name: "README.md",
      type: "file",
      depth: 0,
      gitStatus: "M",
    })
  })

  it("expands a directory on toggleExpand and shows children", async () => {
    // Initial root listing
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
    ])

    const { result } = renderHook(() => useFileTree("/project", []))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.flatNodes).toHaveLength(1)

    // Now expand src/ -- mock the child fetch
    mockTreeResponse([
      { name: "app.ts", path: "/project/src/app.ts", type: "file", gitStatus: "M" },
      { name: "utils.ts", path: "/project/src/utils.ts", type: "file", gitStatus: null },
    ])

    await act(async () => {
      result.current.toggleExpand("/project/src")
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.flatNodes).toHaveLength(3)
    expect(result.current.flatNodes[0]).toMatchObject({
      name: "src",
      type: "dir",
      depth: 0,
      isExpanded: true,
    })
    expect(result.current.flatNodes[1]).toMatchObject({
      name: "app.ts",
      depth: 1,
    })
    expect(result.current.flatNodes[2]).toMatchObject({
      name: "utils.ts",
      depth: 1,
    })
  })

  it("collapses a directory on second toggleExpand", async () => {
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
    ])

    const { result } = renderHook(() => useFileTree("/project", []))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Expand
    mockTreeResponse([
      { name: "app.ts", path: "/project/src/app.ts", type: "file", gitStatus: null },
    ])

    await act(async () => {
      result.current.toggleExpand("/project/src")
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.flatNodes).toHaveLength(2)

    // Collapse
    await act(async () => {
      result.current.toggleExpand("/project/src")
    })

    expect(result.current.flatNodes).toHaveLength(1)
    expect(result.current.flatNodes[0]).toMatchObject({
      name: "src",
      isExpanded: false,
    })
  })

  it("merges session overlay data onto matching file nodes", async () => {
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
    ])

    const sessionFiles = [
      makeGroupedFile("/project/src/app.ts", { editCount: 5, addCount: 10, delCount: 2 }),
    ]

    const { result } = renderHook(() => useFileTree("/project", sessionFiles))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Expand src/
    mockTreeResponse([
      { name: "app.ts", path: "/project/src/app.ts", type: "file", gitStatus: "M" },
      { name: "other.ts", path: "/project/src/other.ts", type: "file", gitStatus: null },
    ])

    await act(async () => {
      result.current.toggleExpand("/project/src")
      await Promise.resolve()
      await Promise.resolve()
    })

    const appNode = result.current.flatNodes.find((n) => n.name === "app.ts")
    expect(appNode).toMatchObject({
      sessionEdits: 5,
      sessionAddCount: 10,
      sessionDelCount: 2,
    })

    const otherNode = result.current.flatNodes.find((n) => n.name === "other.ts")
    expect(otherNode).toMatchObject({
      sessionEdits: 0,
      sessionAddCount: 0,
      sessionDelCount: 0,
    })
  })

  it("marks ancestor directories with hasSessionDescendant", async () => {
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
      { name: "docs", path: "/project/docs", type: "dir", gitStatus: null },
    ])

    const sessionFiles = [
      makeGroupedFile("/project/src/components/Button.tsx"),
    ]

    const { result } = renderHook(() => useFileTree("/project", sessionFiles))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const srcNode = result.current.flatNodes.find((n) => n.name === "src")
    expect(srcNode?.hasSessionDescendant).toBe(true)

    const docsNode = result.current.flatNodes.find((n) => n.name === "docs")
    expect(docsNode?.hasSessionDescendant).toBe(false)
  })

  it("collapseAll collapses all expanded directories", async () => {
    mockTreeResponse([
      { name: "src", path: "/project/src", type: "dir", gitStatus: null },
    ])

    const { result } = renderHook(() => useFileTree("/project", []))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Expand
    mockTreeResponse([
      { name: "app.ts", path: "/project/src/app.ts", type: "file", gitStatus: null },
    ])

    await act(async () => {
      result.current.toggleExpand("/project/src")
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.flatNodes).toHaveLength(2)

    // Collapse all
    await act(async () => {
      result.current.collapseAll()
    })

    expect(result.current.flatNodes).toHaveLength(1)
    expect(result.current.flatNodes[0].isExpanded).toBe(false)
  })

  it("handles fetch errors gracefully", async () => {
    mockedAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Directory not found" }),
    } as unknown as Response)

    const { result } = renderHook(() => useFileTree("/nonexistent", []))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.error).toBeTruthy()
    expect(result.current.flatNodes).toEqual([])
  })
})
