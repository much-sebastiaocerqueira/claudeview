# Cogpit Server — Headless Linux Support

## Problem

Cogpit currently ships as an Electron app. On headless Linux systems (e.g. Arch Linux servers), Electron can't run — there's no display server. Users need a way to run Cogpit as a standalone web server and access it remotely via browser.

## Solution

Create a standalone server entry point that reuses `electron/server.ts`'s `createAppServer()` without Electron. Ship it as an AUR package (`cogpit-server`) with a systemd user service.

## Architecture

```
server/standalone.ts          → Entry point (calls createAppServer)
packaging/aur/PKGBUILD        → AUR build recipe
packaging/aur/cogpit-server.service → Systemd user unit
```

`createAppServer(staticDir, userDataDir)` in `electron/server.ts` is already Electron-agnostic. The standalone entry point just calls it with the right paths.

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `COGPIT_HOST` | `127.0.0.1` | Bind address |
| `COGPIT_PORT` | `19384` | Listen port |
| `COGPIT_DATA_DIR` | `~/.config/cogpit` | Config, search index DB, undo history |

Default bind is `127.0.0.1` — designed for use behind a reverse proxy (Caddy/nginx) or Cloudflare Tunnel for remote access with TLS.

## Systemd — Per-User Service

Runs as the invoking user so it naturally has access to `~/.claude/` session data.

```ini
[Unit]
Description=Cogpit Server - Claude Code Dashboard
After=network.target

[Service]
Type=simple
Environment=COGPIT_HOST=127.0.0.1
Environment=COGPIT_PORT=19384
ExecStart=/usr/bin/bun /opt/cogpit-server/server/standalone.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

Usage:
```bash
systemctl --user enable cogpit-server
systemctl --user start cogpit-server
```

Override env vars with `systemctl --user edit cogpit-server`.

## Remote Access

Bind to `127.0.0.1` by default. For remote access, use one of:

- **Cloudflare Tunnel**: `cloudflared tunnel` pointing to `http://localhost:19384` — zero open ports, automatic HTTPS
- **Caddy/nginx reverse proxy**: terminates TLS, forwards to localhost:19384

## AUR Package (`cogpit-server`)

- Clones repo, runs `bun install` + `bun run build`
- Installs built files to `/opt/cogpit-server/`
- Installs systemd user unit to `/usr/lib/systemd/user/cogpit-server.service`

## New Files

| File | Purpose |
|------|---------|
| `server/standalone.ts` | ~20 lines, standalone entry point |
| `packaging/aur/PKGBUILD` | AUR build recipe |
| `packaging/aur/cogpit-server.service` | Systemd user unit |
| `packaging/aur/.SRCINFO` | AUR metadata |

## Changes to Existing Files

- `package.json`: add `"serve"` and `"serve:start"` scripts

No changes to `electron/server.ts` or any other existing code.
