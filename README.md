# Zeitkonto – personal working-hours tracker (PWA)

A small web app that installs on your Android phone, works offline, and keeps your
flextime balance (Zeitkonto): daily, weekly, monthly, yearly and overall.
All data stays **on your phone** (browser storage). Nothing is sent anywhere.

## Put it online (once, ~5 minutes, free)

An installable web app has to be served over HTTPS. The easiest free host is GitHub Pages:

1. Create a free account at github.com (if you don't have one).
2. Click **+ → New repository**, name it e.g. `zeitkonto`, set it to **Public**, and create it.
3. Click **"uploading an existing file"**, then drag in **all files and the `icons` folder**
   from this zip (not the zip itself). Click **Commit changes**.
4. Go to **Settings → Pages**, under *Branch* choose `main` and `/ (root)`, then **Save**.
5. After about a minute your app is at `https://<your-username>.github.io/zeitkonto/`.

The link isn't secret, but it's harmless: anyone opening it gets an *empty* app, because your data
lives only in your phone's browser.

Alternatives: Netlify, Cloudflare Pages, or any web space with HTTPS work too.

## Install on Android

1. Open the link in **Chrome** on your phone.
2. Tap **⋮ → Add to Home screen → Install**.
3. Open Zeitkonto from the home screen. It now runs full-screen and offline.

Keep using the installed app (not the browser tab): Android then protects its storage from automatic clean-up.

## First steps

1. **Settings**: set your target hours per weekday, your Bundesland, the date you start counting from,
   and any existing overtime as the opening balance.
2. **Today**: log a day (date, start, end, break, office/home office), or use *Clock in now* / *Clock out*.
   Tap **☕ Break** to add a break with one tap (length set in Settings; *Undo last break* takes it back).
   While clocked in, the break goes into the running session; otherwise into today's latest entry.
3. **Calendar**: tap any day to add times or mark it as vacation, ½ vacation, sick leave,
   public holiday or overtime off (*Gleittag*). To mark many days at once, tap **Select several days**,
   tap the first and last day, **Fill range**, then pick the type (weekends and public holidays are
   skipped unless you untick that option).
4. **Balances**: year → months → ISO weeks → days, each with worked/target/balance.

### How days count

| Day type | Target | Effect on balance |
|---|---|---|
| Office / Home office | your weekday target | worked − target |
| Vacation, Sick leave, Public holiday | 0 | unchanged; any work is overtime |
| ½ Vacation | half the target | worked − half target |
| Overtime off | your weekday target | reduces the balance (you're spending overtime) |
| Weekend (target 0) | 0 | any work is overtime |

Today only counts once you've logged something, so the balance doesn't drop in the morning.
Days with no entry in the past count as 0 h worked (shown in red in the calendar), which reminds you to fill them in.

## Backups and export

Settings → *Your data*:

- **Backup (.json)**: a complete copy of your data. *Share backup…* sends it straight to Google Drive or email.
  Restore it on any device with *Restore from backup*.
- **Table (.csv)**: one row per day with times, worked, target, balance and the running account.
  It opens in Excel or LibreOffice (choose the German or international format).

The app reminds you if you haven't made a backup for 30 days.

## Updating the app

1. Upload the new files to your GitHub repository (**Add file → Upload files**, drag in the files and the
   `icons` folder, **Commit changes**). Files with the same name are overwritten.
2. Wait 1–2 minutes until GitHub Pages has published (green ✓ under the **Actions** tab).
3. Open the app on your phone. Within a few seconds a blue **“A new version is available – Reload”** bar
   appears; tap **Reload**. (If you don't see it, close the app completely and open it again, or use
   **Settings → Check for updates**.)

Your data is never touched by an update. Settings → *App* shows the installed version and what's new.

If you change files yourself, raise the version number in **both** places, or phones keep the old version:
- `APP_VERSION` near the top of `app.js` (e.g. `2` → `3`), and
- `CACHE` at the top of `sw.js` (e.g. `'zeitkonto-v2'` → `'zeitkonto-v3'`).
