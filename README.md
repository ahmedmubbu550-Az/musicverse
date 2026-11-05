# MUSICVERSE

A responsive premium music-library web app with shared YouTube music search and official embedded playback.

## Features
- Search YouTube music videos directly inside MUSICVERSE
- English, Pakistani and Bollywood discovery shortcuts
- Play selected YouTube search results in the in-page YouTube IFrame Player
- Add Spotify track, album, playlist and artist embeds
- Custom playlists, favorites and recently played
- Category queues, shuffle and repeat
- Mobile-friendly dark interface
- Local browser storage for each user's personal library

## Shared search architecture
The browser calls the Vercel serverless endpoint at `/api/search`. The endpoint reads `YOUTUBE_API_KEY` from the Vercel server environment and calls YouTube Data API v3. The API key is never sent to the browser and users do not need to paste their own key.

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
