# TwinTemp ☕🌡️
Cozy weather for iPhone with °F and °C side by side.

## Install (GitHub Pages)
1. On GitHub, create a new **public** repository named `twintemp`.
2. **Add file → Upload files**. Drag in everything from this zip, including the `icons` folder (unzip first, then upload the files themselves, not the zip). Tap **Commit changes**.
3. **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Tap **Save**.
4. Wait 1–2 minutes, then open `https://YOUR-USERNAME.github.io/twintemp/` in **Safari** on your iPhone.
5. Tap **Share → Add to Home Screen → Add**.
6. Open TwinTemp from your Home Screen and tap **Allow** when it asks for your location.

## Updating later
Upload the changed files (choose to replace them), then edit `sw.js` and bump `twintemp-v1` → `twintemp-v2` so your phone downloads the new version. Close the app completely and reopen it.

## Data sources
- Forecasts: Open-Meteo.com (open-source, no API key, CC BY 4.0)
- US weather alerts: NOAA / National Weather Service (api.weather.gov)
- Place names: BigDataCloud, with OpenStreetMap Nominatim as the backup; Open-Meteo geocoding for city search
