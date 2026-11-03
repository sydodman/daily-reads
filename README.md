# Daily Reads

A bus-journey study app: a short article, 10 multiple-choice questions with explanations, and one "in your own words" question. Works offline on the bus; results send to a Google Sheet when there's signal; you see them on a parent dashboard.

## One-off setup (about 15 minutes)

### 1. Put the app on GitHub Pages
1. Create a **public** repo (e.g. `daily-reads`) and upload everything in this folder.
2. Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute it's live at `https://<your-username>.github.io/daily-reads/`.

Nothing personal goes in the repo — no names, no results. Her name is set on her phone only.

### 2. Create the results Sheet
1. Make a new Google Sheet (e.g. "Daily Reads results").
2. Extensions → Apps Script. Delete the sample code and paste in `apps-script/Code.gs`.
3. Change the two keys at the top: `WRITE_KEY` (anything) and `READ_KEY` (something long and private).
4. Deploy → New deployment → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy, and approve the permissions prompt.
5. Copy the web app URL (ends in `/exec`).

### 3. Connect the two
Edit `config.js` in the repo: paste the URL into `SCRIPT_URL` and set `WRITE_KEY` to match Code.gs. Commit.

### 4. Her phone
Open the GitHub Pages link in **Safari** → Share → **Add to Home Screen**. It now opens like an app and keeps working with no signal. She can tap "Set your name" at the bottom of the home screen.

### 5. Your phone
Open `https://<your-username>.github.io/daily-reads/parent.html?key=<READ_KEY>` once. The key is remembered on that device and removed from the address bar. Add it to your home screen too if you like.

## The weekly loop
- **Weekend:** tell Claude what she's covering (plus the dashboard's "Copy summary for Claude" text). We agree the topics; Claude writes a new `content/week.json` and pushes it to the repo.
- **Weekdays:** two sessions a day (to and from school), each ~20 minutes. Missed sessions appear under "Catch up".
- **Any time:** check the dashboard — scores, minutes on task, how often she left the app mid-session, weak topics over the last 4 weeks, and her written answers.

## Notes
- The timer only counts while the app is on screen, so the minutes are honest.
- Questions unlock after a minimum reading time, so she can't skip straight to guessing.
- If she closes the app mid-session it resumes where she left off.
- `WRITE_KEY` is visible in the public repo; it only lets someone *add* rows. Your results can only be read with `READ_KEY`, which never goes in the repo.
- After changing `Code.gs`, use Deploy → Manage deployments → Edit → New version, so the URL stays the same.
