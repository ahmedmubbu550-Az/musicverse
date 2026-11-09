# MUSICVERSE

A responsive premium music-library web app with shared YouTube music search and official embedded playback.

## Features
- Premium dashboard layout: sidebar, search bar, now-playing panel with queue, full player bar
- Mobile app layout: bottom tab bar, mini player, swipe-down full-screen player
- **Instant search** — results appear as you type, from the first letter. Partial words work ("ari" finds Arijit Singh), matches are highlighted, and suggestions complete your keyword
- Two sources: **Free music** (Audius, audio-only, keeps playing with the screen locked) and **YouTube** (via the `/api/search` serverless function)
- Top result, songs, artists and "from your library" sections, plus filters and recent searches
- Trending now, genre/mood tiles, recently played, artist pages
- Liked songs, saved songs, unlimited playlists (create, rename, delete, add/remove songs)
- Add Spotify or YouTube links manually
- Shuffle, repeat (all / one), seek, volume, play-next, lock-screen and headset controls
- Keyboard shortcuts: `/` or `Ctrl+K` search, `Space` play/pause, `Shift+→/←` next/previous, `L` like
- Library is stored in the browser (localStorage); old MUSICVERSE data is migrated automatically

## Shared search architecture
The browser calls the Vercel serverless endpoint at `/api/search`. `/api/suggest` returns keyword completions for partial words (no API key or quota needed). The search endpoint reads `YOUTUBE_API_KEY` from the Vercel server environment and calls YouTube Data API v3. The API key is never sent to the browser and users do not need to paste their own key.

## Deploy to Vercel
1. Import this GitHub repository into Vercel and deploy the project root.
2. In the Vercel project, open **Settings → Environment Variables**.
3. Add `YOUTUBE_API_KEY` with your Google Cloud YouTube Data API v3 key. Set the target to **Production**, and also **Preview** if you use preview deployments.
4. Redeploy after adding the variable.

### Google API key setup
1. In Google Cloud Console, enable **YouTube Data API v3**.
2. Create a new API key.
3. Under **API restrictions**, restrict it to **YouTube Data API v3** only.
4. Because the API call runs server-to-server from Vercel, do not use an HTTP-referrer (Websites) restriction for this key; the browser's website referrer is not the server's outgoing request origin. Keep it private in Vercel Environment Variables and never commit it to GitHub or paste it into the website.
5. Monitor your Google Cloud API quota and billing settings.

## Playback and licensing
MUSICVERSE does not host, scrape, download, or bypass music services. Search results come from YouTube Data API v3 and play through YouTube's official embedded player. Actual play/pause, seek and volume are available in the embedded player. YouTube account, regional, advertising, embed-permission and content restrictions still apply. Spotify content plays through Spotify's official embed, whose playback experience varies by track, account, region and device.

## Local development
Open `index.html` through a local web server and run the Vercel Functions locally with the Vercel CLI:
```bash
vercel dev
```
Set `YOUTUBE_API_KEY` in the local Vercel environment (for example via the Vercel project environment settings). Do not commit `.env` files.

## Data and privacy
Favorites, playlists and recently played items are stored in the current browser's localStorage and do not sync between devices. Search uses the shared server-side API key configured by the site owner. Do not put personal or private information in this public repository.

