# New World Recruitment UX Prototype

This repository hosts a single-page recruitment site prototype for the UX/UI academic redesign project.

- Live site: https://li-baixi.github.io/NWD/
- Main page: `index.html`
- Images: `assets/images/`
- Published content edits: `edits.json`
- Editor code: `assets/editor/`

## Open the in-page editor

Use one of these methods while viewing the site:

- Press `Ctrl + Shift + E` on Windows/Linux, or `Cmd + Shift + E` on macOS.
- Add `#editor` to the end of the site URL.

While editing is enabled:

- Click any outlined text to edit it in place. Changes save to the browser instantly — click elsewhere (or press `Ctrl + Enter`) to confirm, `Esc` to cancel.
- Click any outlined image to open the crop panel. Drag to reposition, adjust the zoom slider, then apply — the exported image keeps the page slot's ratio, so the layout never shifts.
- The toolbar language tabs (简 / 繁 / EN) switch which language layer you are editing; each language keeps its own edits.
- 撤销本地修改 drops all unpublished changes and restores the last published content.
- The status area always shows how many changes are waiting to be published.

## Connect GitHub (one-time setup)

Publishing needs a fine-grained personal access token scoped to this repository only:

1. In the editor toolbar select 连接 GitHub, then 打开令牌创建页 — the form is pre-filled (name, 90-day expiry, Contents: Read and write).
2. Under Repository access choose **Only select repositories** and check `Li-Baixi/NWD`.
3. Select **Generate token** and copy the token.
4. Paste it into the panel and select 连接.

The token is stored only in this browser's local storage. Revoke it anytime at github.com/settings/personal-access-tokens; 断开连接 removes it from the browser.

## Publish changes

Select 发布 in the toolbar:

1. Cropped images are committed to `assets/edits/` as real image files, keeping `edits.json` small.
2. All pending text and image changes are merged into `edits.json` on `main`.
3. GitHub Pages redeploys automatically — the toolbar shows 已上线 ✓ once the live site is updated (usually within a minute).

If the token has expired, the editor reopens the connection panel — paste a fresh token to continue.

## Local preview

Open `index.html` directly in a browser. Editing and local saving work, and publishing works too. On `file://` the remote `edits.json` is not loaded, and cropping an image already loaded from disk is blocked by browser security — re-select it with 从电脑选择图片 to crop it.
