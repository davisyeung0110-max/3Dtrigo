# Put SolidSight online with GitHub Pages

This app is a static site: `index.html`, `styles.css`, and `app.js`. There is no build step, server, or framework to install. GitHub Pages can serve it directly.

## Fastest route — browser only

1. Sign in at [github.com](https://github.com).
2. Open **<https://github.com/new?name=solidsight&visibility=public>**.
   - Repository name: `solidsight`
   - Visibility: **Public**
   - Do **not** add a README, `.gitignore`, or licence yet.
3. Click **Create repository**.
4. On the new repository page, click **Add file → Upload files**.
5. Extract `SolidSight-GitHub-Pages.zip`, then drag these files into the upload area:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `DEPLOY.md` (optional)
6. Click **Commit changes**.
7. Open **Settings → Pages**.
8. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
   - Click **Save**.
9. Wait 1–2 minutes. Your site will be at:

   `https://YOUR-GITHUB-USERNAME.github.io/solidsight/`

   GitHub shows the exact URL at the top of **Settings → Pages** after it deploys.

## Optional: command-line route

If you have Git installed:

```bash
git init
git add .
git commit -m "Initial SolidSight app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/solidsight.git
git push -u origin main
```

Then enable Pages as in steps 7–9 above.

## If you want a root URL

Name the repository exactly:

`YOUR-USERNAME.github.io`

Then the site will be at `https://YOUR-USERNAME.github.io/` instead of `/solidsight/`.

## Notes

- GitHub Pages is public. Make the repository public so free Pages hosting is available.
- The Photo Lab, text parser, 3D tools, and named points work without a server.
- The optional **Scan a photo** OCR button downloads Tesseract.js from a CDN when first used, so it needs an internet connection. It works on HTTPS GitHub Pages.
- To update the online app later, upload the changed files to the repository and commit. Pages redeploys automatically.

## If something looks blank

- Make sure the uploaded files are at the **root** of the repository, not inside a folder.
- In **Settings → Pages**, confirm branch `main` and folder `/ (root)`.
- Open the site URL from the Pages settings panel, not the repository file preview.
- Wait a little after the first deploy.
