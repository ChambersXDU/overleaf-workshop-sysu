# Overleaf Workshop (SYSU)

Fork of [Overleaf Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) adapted for Sun Yat-sen University LaTeX:

**https://latex.sysu.edu.cn**

Extension ID: `cham.overleaf-workshop-sysu`

---

## Installation

1. Open the [Releases](https://github.com/ChambersXDU/overleaf-workshop-sysu/releases) page and download the latest `.vsix`.
2. In VS Code / Cursor: **Extensions: Install from VSIX...** and select the downloaded file.
3. Disable or uninstall the marketplace extension `iamhyc.overleaf-workshop` if it is installed, to avoid command conflicts.
4. Reload the window after installation.

---

## Usage

### Login

1. Sign in to https://latex.sysu.edu.cn in a browser.
2. Open Developer Tools (F12) → **Network**, then open or refresh the project list.
3. Select a request to `/project` and copy the session cookie, for example:

   ```text
   overleaf.sid=...
   ```

4. In the extension, add server `https://latex.sysu.edu.cn` and use **Login with Cookies**.

### Open a project

Select a project in the Overleaf Workshop sidebar to open it in the editor.

**Note:** Direct open uses a virtual file system (`overleaf-workshop://...`). Integrated terminals and tools that only access local paths cannot see these files. For local paths (terminal, AI assistants, LaTeX Workshop, etc.), use **Open Project Locally...** on the project and choose a directory on disk.

---

## Changes relative to upstream

| Area | Change |
|------|--------|
| Connectivity | Prefer Socket.IO v2 handshake with `?projectId=` (required by latex.sysu.edu.cn). |
| HTTP client | Patch `xmlhttprequest` so `Host` does not include default port `:443` (avoids ALB connection reset). |
| Packaging | Published as a separate extension id for side-by-side installation. |

See `src/api/socketio.ts` and `patches/xmlhttprequest+1.8.0.patch`.

---

## License

AGPL-3.0, same as upstream. Upstream project: [overleaf-workshop/Overleaf-Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop).
