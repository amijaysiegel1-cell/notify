# Notify

A clean, customizable desktop app for Spotify, inspired by Apple Music's look.

- **Synced lyrics**: the current word lights up as it's sung. Lyrics scroll smoothly, lines further from the current one are softly blurred, breathing dots show during instrumental breaks, and you can click any line to jump there.
- **Moving album covers**: the cover art gently flows or pans and zooms. Behind it, a blurred, animated background is made from the cover's colors.
- **Listening stats**: minutes listened, plays, day streak, a minutes-per-day chart and a 24-hour listening clock. It also shows your Spotify top tracks, artists and genres for the last 4 weeks, 6 months or all time, and what you played recently.
- **Customizable**: themes (Adaptive, Dark, OLED, Light), accent color (taken from the album or your own pick), five fonts, corner roundness, glass transparency, density, background style and speed, artwork motion, and lyric size, alignment and effects.
- **Mini player**: a small always-on-top window that shows the current lyric line (Ctrl+M).
- **Home, Search, Library, playlists, albums, artists, queue and device picker.**

## Install

Run `Notify-Setup-1.0.0.exe` (installer) or `Notify-1.0.0-Portable.exe` (no install).
The app isn't code-signed, so Windows SmartScreen may warn you. Click **More info → Run anyway**.

## One-time Spotify setup

Notify signs in with your own Spotify developer app. The Client ID `fb7055906c88423c80d25ff72fe1728a` is already built in.

1. Go to <https://developer.spotify.com/dashboard> and open your app.
2. **Settings → Redirect URIs**: add `http://127.0.0.1:8898/callback` exactly, then tick **Web API** and save.
3. **User Management**: add the Spotify account email of everyone who will use Notify. Spotify allows up to 5 users while an app is in Development Mode.
4. Open Notify and click **Connect Spotify**. Your browser opens; approve the permissions and switch back to the app.

**Requirements:** Spotify **Premium**. Spotify requires it both for Development Mode apps and for controlling playback.

## How playback works

Notify is a front-end that controls Spotify through **Spotify Connect**. The audio itself comes from the official Spotify app (or your phone, speaker, etc.).
If no device is active, Notify starts Spotify minimized in the background. You can turn this off in Settings.
Use the device button in the player bar to switch where music plays.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Seek 5 s |
| Ctrl + ← / → | Previous / next track |
| ↑ / ↓ | Volume |
| L | Open / close lyrics |
| Ctrl + M | Mini player |
| Esc | Close Now Playing |

## Privacy

- Your login tokens, settings and listening history are stored only on your PC, in `%APPDATA%\Notify`.
- Nothing is sent anywhere except Spotify (for your music) and LRCLIB (song title, artist and length, to look up lyrics).

## Notes and limitations

- Lyrics come from [LRCLIB](https://lrclib.net), a free, community-run lyrics database. Popular songs nearly all have synced lyrics. Rarer songs may only have plain text, or nothing.
- Spotify doesn't let other apps use its own animated "Canvas" videos or Apple's motion artwork. Instead, Notify animates the cover art itself in real time (Liquid or Drift mode, in Settings → Now Playing).
- Stats from Notify's own history begin once you start listening with it. Your last 50 Spotify plays are imported when you sign in. The Spotify top tracks and artists sections work from day one.

## Build from source

```bash
npm install
npm start            # run in development
npm run dist:win     # build the installer + portable .exe into dist/
```

Building on Windows needs no extra tools. To build on Linux you need `wine64` installed.
