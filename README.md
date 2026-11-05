# MUSICVERSE

A responsive, premium dark music-library web app designed for GitHub Pages. No build tools, server, database, or API key required.

## Features
- English, Pakistani and Bollywood discovery shortcuts
- Add Spotify track / album / playlist / artist links
- Add YouTube video and playlist links
- Embedded official provider players
- Custom playlists (create, rename, delete)
- Favorites, recently played, category queues, shuffle and repeat controls
- Local browser storage (your library stays in the browser/device where you created it)
- Mobile-friendly layout

## Important streaming note
MUSICVERSE does not host, scrape, download, or bypass music services. Playback is provided by official Spotify and YouTube embeds. You need to add links to content available on those services. Provider account, region, ad, and playback restrictions still apply. The app's previous/next buttons move through the app's category queue; actual play/pause, seeking, and volume are controlled inside the embedded Spotify/YouTube player. Spotify may require login and its embed experience can vary by track/account/device.

## Run locally
Open `index.html` in a modern browser. For best results, serve the folder using VS Code Live Server or:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`.

## Publish on GitHub Pages
1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. The included workflow deploys the static site when changes are pushed to `main`.

The expected site URL is `https://ahmedmubbu550-az.github.io/musicverse/`.

## Use it
1. Open the live website.
2. Click **＋ Add a song**.
3. Enter a display name and optionally artist.
4. Paste a Spotify URL (`https://open.spotify.com/track/...`, `/album/...`, `/playlist/...`) or YouTube URL (`https://www.youtube.com/watch?v=...`, `https://youtu.be/...`, or a playlist URL).
5. Choose English, Pakistani, Bollywood or Other and optionally a playlist.
6. Click **Add to MUSICVERSE**. The provider's embedded player appears on the page.
7. Use the provider player for play/pause, seek and volume. MUSICVERSE controls the library, favorites, category queue, shuffle and repeat.

## Data and privacy
Your playlist data is stored in this browser's `localStorage`. It does not sync across devices or browsers. Anyone with access to the same browser profile can see it. GitHub Pages hosts public website files; do not put secrets or private data in this repository.
