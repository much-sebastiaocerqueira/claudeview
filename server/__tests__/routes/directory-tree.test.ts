// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Dirent } from "node:fs"
import type { UseFn, Middleware } from "../../helpers"

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}))

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}))

import { readdir, stat } from "node:fs/promises"
import { execFile } from "node:child_process"
import { registerDirectoryTreeRoutes } from "../../routes/directory-tree"

const mockedReaddir = vi.mocked(readdir)
const mockedStat = vi.mocked(stat)
const mockedExecFile = vi.mocked(execFile)

function createMockReqRes(method: string, url: string) {
  const req = {
    method,
    url,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
  }

  let endData = ""
  let statusCode = 200
  const headers: Record<string, string> = {}
  const res = {
    get statusCode() { return statusCode },
    set statusCode(v: number) { statusCode = v },
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value }),
    end: vi.fn((data?: string) => { endData = data || "" }),
    _getData: () => endData,
    _getStatus: () => statusCode,
    _getJson: () => JSON.parse(endData),
  }

  const next = vi.fn()
  return { req, res, next }
}

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "/test",
    parentPath: "/test",
  } as Dirent
}

// Helper to mock execFile calls based on the command arguments
function setupExecFileMock(opts: {
  gitRoot?: string | null
  gitStatus?: string
  gitIgnored?: string[]
}) {
  mockedExecFile.mockImplementation((...args: unknown[]) => {
    const cmdArgs = args[1] as string[]
    const callback = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void

    // git rev-parse --show-toplevel
    if (cmdArgs.includes("rev-parse")) {
      if (opts.gitRoot) {
        callback(null, opts.gitRoot + "\n", "")
      } else {
        callback(new Error("not a git repo"), "", "")
      }
      return {} as ReturnType<typeof execFile>
    }

    // git status --porcelain
    if (cmdArgs.includes("status")) {
      callback(null, opts.gitStatus || "", "")
      return {} as ReturnType<typeof execFile>
    }

    // git check-ignore --stdin
    if (cmdArgs.includes("check-ignore")) {
      callback(null, (opts.gitIgnored || []).join("\n"), "")
      return {} as ReturnType<typeof execFile>
    }

    callback(null, "", "")
    return {} as ReturnType<typeof execFile>
  })
}

describe("directory-tree routes", () => {
  let handlers: Map<string, Middleware>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    const use: UseFn = (path: string, handler: Middleware) => {
      handlers.set(path, handler)
    }
    registerDirectoryTreeRoutes(use)
  })

  it("registers the /api/directory-tree route", () => {
    expect(handlers.has("/api/directory-tree")).toBe(true)
  })

  it("calls next for non-GET methods", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes("POST", "/api/directory-tree")

    await handler(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it("returns 400 when path is missing", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes("GET", "/api/directory-tree")

    await handler(req, res, next)
    expect(res._getStatus()).toBe(400)
    expect(res._getJson().error).toMatch(/path/)
  })

  it("returns 400 when path is relative", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=relative/path",
    )

    await handler(req, res, next)
    expect(res._getStatus()).toBe(400)
    expect(res._getJson().error).toMatch(/absolute/)
  })

  it("returns 404 when path does not exist", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/nonexistent",
    )
    mockedStat.mockRejectedValue(new Error("ENOENT"))

    await handler(req, res, next)
    expect(res._getStatus()).toBe(404)
  })

  it("returns 400 when path is not a directory", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/file.txt",
    )
    mockedStat.mockResolvedValue({ isDirectory: () => false } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)

    await handler(req, res, next)
    expect(res._getStatus()).toBe(400)
    expect(res._getJson().error).toMatch(/directory/)
  })

  it("returns sorted entries (dirs first, then files, alphabetical)", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/project",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([
      makeDirent("zebra.ts", false),
      makeDirent("src", true),
      makeDirent("alpha.ts", false),
      makeDirent("docs", true),
    ] as Dirent[])

    setupExecFileMock({ gitRoot: "/test/project", gitStatus: "" })

    await handler(req, res, next)

    expect(res._getStatus()).toBe(200)
    const data = res._getJson()
    expect(data.entries).toHaveLength(4)
    // Dirs first, alphabetical
    expect(data.entries[0]).toMatchObject({ name: "docs", type: "dir" })
    expect(data.entries[1]).toMatchObject({ name: "src", type: "dir" })
    // Files second, alphabetical
    expect(data.entries[2]).toMatchObject({ name: "alpha.ts", type: "file" })
    expect(data.entries[3]).toMatchObject({ name: "zebra.ts", type: "file" })
    expect(data.truncated).toBe(false)
  })

  it("includes git status for modified files", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/project/src",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([
      makeDirent("app.ts", false),
      makeDirent("utils.ts", false),
    ] as Dirent[])

    setupExecFileMock({
      gitRoot: "/test/project",
      gitStatus: " M src/app.ts\n?? src/new-file.ts\n",
    })

    await handler(req, res, next)

    expect(res._getStatus()).toBe(200)
    const data = res._getJson()
    const appEntry = data.entries.find((e: { name: string }) => e.name === "app.ts")
    expect(appEntry.gitStatus).toBe("M")
    const utilsEntry = data.entries.find((e: { name: string }) => e.name === "utils.ts")
    expect(utilsEntry.gitStatus).toBeNull()
  })

  it("filters out .git directory and .DS_Store", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/project",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([
      makeDirent(".git", true),
      makeDirent(".DS_Store", false),
      makeDirent("src", true),
      makeDirent(".env", false),
    ] as Dirent[])

    setupExecFileMock({ gitRoot: "/test/project", gitStatus: "" })

    await handler(req, res, next)

    const data = res._getJson()
    const names = data.entries.map((e: { name: string }) => e.name)
    expect(names).not.toContain(".git")
    expect(names).not.toContain(".DS_Store")
    expect(names).toContain("src")
    expect(names).toContain(".env")
  })

  it("filters out gitignored entries", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/project",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([
      makeDirent("node_modules", true),
      makeDirent("src", true),
      makeDirent("dist", true),
    ] as Dirent[])

    setupExecFileMock({
      gitRoot: "/test/project",
      gitStatus: "",
      gitIgnored: ["node_modules", "dist"],
    })

    await handler(req, res, next)

    const data = res._getJson()
    const names = data.entries.map((e: { name: string }) => e.name)
    expect(names).toEqual(["src"])
  })

  it("returns gitRoot in response", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/project/src",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([])

    setupExecFileMock({ gitRoot: "/test/project", gitStatus: "" })

    await handler(req, res, next)

    const data = res._getJson()
    expect(data.gitRoot).toBe("/test/project")
  })

  it("returns null gitRoot when not in a git repo", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/nongit",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
    mockedReaddir.mockResolvedValue([
      makeDirent("file.txt", false),
    ] as Dirent[])

    setupExecFileMock({ gitRoot: null })

    await handler(req, res, next)

    const data = res._getJson()
    expect(data.gitRoot).toBeNull()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].gitStatus).toBeNull()
  })

  it("sets truncated=true when entries exceed cap", async () => {
    const handler = handlers.get("/api/directory-tree")!
    const { req, res, next } = createMockReqRes(
      "GET",
      "/api/directory-tree?path=/test/huge",
    )

    mockedStat.mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)

    // Generate 5001 entries
    const entries = Array.from({ length: 5001 }, (_, i) =>
      makeDirent(`file-${String(i).padStart(5, "0")}.ts`, false),
    )
    mockedReaddir.mockResolvedValue(entries as Dirent[])

    setupExecFileMock({ gitRoot: "/test/huge", gitStatus: "" })

    await handler(req, res, next)

    const data = res._getJson()
    expect(data.truncated).toBe(true)
    expect(data.entries.length).toBeLessThanOrEqual(5000)
  })
})
