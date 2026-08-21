# BagBack PWA prototype 0.1.0

A no-build Progressive Web App prototype for iPhone and desktop browsers.

## What works

- Start/end a walk
- Precise browser geolocation with high accuracy requested
- Drop a bag at the current GPS position
- Current and forgotten bags
- Nearest-first bag list
- Distance and direction arrow
- Optional device compass permission
- Pick up a bag
- Apple Maps walking directions
- MapLibre GL JS with OpenFreeMap
- Local-only bag/walk storage using localStorage
- Installable PWA manifest
- App-shell service worker for basic offline launch
- Light/dark mode

## Important iPhone limitation

This web version cannot guarantee continuous GPS updates or nearby reminders when iOS suspends the PWA in the background or while the phone is locked. Open BagBack again to resume location updates.

## Test locally

Geolocation generally requires HTTPS, except that browsers usually allow it on localhost.

From this directory, run for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` on the same computer.

For an iPhone test, deploy the site to an HTTPS host such as GitHub Pages.

## Deploy to GitHub Pages

1. Create a public repository, for example `bagback-web`.
2. Upload everything in this folder to the repository root.
3. Open Settings -> Pages.
4. Choose Deploy from a branch.
5. Select `main` and `/ (root)`.
6. Save and wait for the HTTPS Pages URL.
7. Open that URL in Safari on iPhone.
8. Tap Share -> Add to Home Screen.

## Privacy

The prototype links to the current BagBack privacy policy:

https://martin73mac.github.io/bagback-privacy/

The saved walk/bag database itself is kept in the browser on the device. Map resources are requested from OpenFreeMap when the map is used.

## Next steps

- Add English/Czech/German/Slovak UI translations
- Add configurable nearby distance
- Improve iPhone resume/recovery behavior
- Add in-app foreground-only proximity alert
- Consider IndexedDB migration instead of localStorage
- Add a dedicated web privacy-policy section if the PWA becomes public
