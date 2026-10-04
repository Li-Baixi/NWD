# New World Recruitment UX Prototype

This repository hosts a single-page recruitment site prototype for the UX/UI academic redesign project.

- Live site: https://li-baixi.github.io/NWD/
- Main page: `index.html`
- Images: `assets/images/`
- Remote content edits: `edits.json`

## Open the in-page editor

Use one of these methods while viewing the live site:

- Press `Ctrl + Shift + E` on Windows/Linux, or `Cmd + Shift + E` on macOS.
- Add `#editor` to the end of the site URL.

The normal page layout stays visible. While editing is enabled, click any outlined text or image where it appears on the page.

- Text opens directly in place. Choose **完成** to save or **取消** to restore the previous text.
- Images open a floating crop panel. Drag the image to reposition it and use the zoom slider. The exported image keeps the same ratio as its page slot, so the layout does not shift.
- The toolbar supports Simplified Chinese, Traditional Chinese, and English. Each language has its own editable text layer.

When opening `index.html` directly with `file://`, browser security blocks cropping an image that is already loaded from disk. Select that image again with **从电脑选择图片** to crop it, or open the GitHub Pages URL where the same-origin images crop directly.

## Publish edits to GitHub

1. Edit text or images in place.
2. Select **保存到浏览器** to preview and save locally.
3. Select **一键发布到 GitHub**.

The page does not require a personal access token and does not call the GitHub API from the browser.

- For normal text or online image changes, GitHub opens a pre-filled issue. Confirm the account and select **Submit new issue**. A repository workflow applies the change and closes the issue automatically.
- For large local-image changes, the page downloads an `edits-update-...json` file and opens the GitHub upload page. Drag the downloaded file into that page and select **Commit changes**. A repository workflow merges the file into `edits.json` automatically.

GitHub Pages publishes the merged changes automatically.

## Local preview

Open `index.html` directly in a browser. Browser-only edits still work.
