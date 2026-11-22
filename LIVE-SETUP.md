# Setting up live mode

Replays work with no setup at all. To follow a session **live**, the dashboard needs an OpenF1 login, because OpenF1 only gives real-time data to its paying supporters. This guide covers it from start to finish. It takes about 10 minutes, and you only do it once.

You need:

- The dashboard folder on your PC. In these steps it is `C:\f1-telemetry-dashboard-phase-3-odds`. If yours has another name, use that.
- About EUR 9.90 a month for OpenF1.

---

## Step 1: Get an OpenF1 login

1. Open <https://openf1.org> in your browser.
2. Find the part about **real-time / live data** (OpenF1 calls the paid tier "sponsor"). Follow its link to sign up and pay. The price was EUR 9.90/month when this was written.
3. Once you have paid, OpenF1 gives you a **username** and a **password** for the API. Look in your email for them.
   - The username is usually the email address you signed up with.
   - Keep that email: you will copy both values in step 3.

> If the OpenF1 site shows the steps differently, follow the site. All the dashboard needs from this step is the username and password.

## Step 2: Open the dashboard folder

1. Open **File Explorer** (the yellow folder icon on the taskbar, or press `Windows key + E`).
2. Click **This PC** on the left, then **Local Disk (C:)**.
3. Double-click the dashboard folder, `f1-telemetry-dashboard-phase-3-odds`.
4. Make file extensions visible, so you can tell `.env` from `.env.txt`:
   - **Windows 11:** click **View** on the toolbar, then **Show**, then tick **File name extensions**.
   - **Windows 10:** click the **View** tab at the top and tick **File name extensions**.

## Step 3: Create the `.env` file with your login

The dashboard reads your login from a file named exactly `.env`: a dot, then `env`, and nothing after it.

1. Click the **Start** button, type `Notepad`, and press **Enter**.
2. Copy these two lines into Notepad:

   ```
   OPENF1_USERNAME=
   OPENF1_PASSWORD=
   ```

3. Type your OpenF1 username after the first `=` and your password after the second, with **no spaces and no quotes**. For example:

   ```
   OPENF1_USERNAME=john@example.com
   OPENF1_PASSWORD=MyOpenF1Password
   ```

4. Click **File**, then **Save as**.
5. In the Save window:
   - On the left, go to **This PC → Local Disk (C:) → f1-telemetry-dashboard-phase-3-odds**.
   - Next to **Save as type**, choose **All files (\*.\*)**. *This matters: otherwise Notepad saves it as `.env.txt`.*
   - In **File name**, type `.env`.
   - Click **Save**.
6. In File Explorer, check that the folder now has a file named `.env`, sitting next to `package.json` and `README.md`. If it says `.env.txt`, right-click it, choose **Rename**, remove the `.txt` and press **Enter** (click **Yes** if Windows warns you).

> There is already a file called `.env.example` in the folder. It's a template only, and the dashboard does not read it. Leave it as it is.

## Step 4: Check the login (any day, no race needed)

1. Click **Start**, type `cmd`, and press **Enter** to open the Command Prompt (a black window).
2. Type this and press **Enter**:

   ```
   cd C:\f1-telemetry-dashboard-phase-3-odds
   ```

3. Type this and press **Enter**:

   ```
   npm run check-live
   ```

4. You should see three **OK** lines and **"All set."** If a line says **FAIL**, the line under it says what to fix. The usual causes:

   | What it says | What to do |
   |---|---|
   | Found ".env.txt" instead of ".env" | Rename the file as in step 3.6. |
   | No .env file | The file is missing or in the wrong folder. Save it in the dashboard folder (step 3.5). |
   | OPENF1_USERNAME is empty | Your username is missing after the `=`. |
   | OpenF1 did not accept the login | There is a typo in the username or password, or the sponsorship isn't active yet. Check the OpenF1 email. |

## Step 5: Watch a session live

OpenF1's live data starts **30 minutes before** each session (practice, qualifying, sprint, race) and stops 30 minutes after it ends.

1. In the Command Prompt, in the dashboard folder (step 4.2), type `npm start` and press **Enter**. Leave this window open the whole time.
2. Open <http://localhost:8787> in your browser and drag the window onto the portrait monitor. Press **F11** for full screen.
3. Click **Go live** at the top of the session list. The header shows a red **LIVE** badge.
4. **Match the delay to F1 TV.** Your F1 TV picture runs behind real time, so the dashboard holds its data back to match:
   - Click **F1 TV** in the header. That sets a 30 second delay as a starting point.
   - Watch for a moment that's easy to spot on both screens, such as a car crossing the line or a flag. If the dashboard shows it **before** the TV, click **+1** a few times. If it shows it **after**, click **−1**.
   - The dashboard remembers your delay for next time.
5. The **Race winner chance** panel fills in by itself during race weekends. Kalshi usually opens each race's market a few days before the race. It needs no login.

To stop, close the browser tab, then click the Command Prompt window and press **Ctrl + C**.

## When you download a new version

Each new version comes as a new ZIP and makes a new folder, and that folder will **not** contain your `.env`.

- **Copy your `.env`** from the old folder into the new one (right-click → Copy, then right-click → Paste in the new folder).
- **Install the new version's pieces:** in the new folder, run `npm install` once, then `npm run check-live`.

## Try it without a race

`npm run simulate` replays the 2025 Abu Dhabi GP as if it were live right now, including its real Kalshi odds. It needs no OpenF1 login, so it's a good way to practise steps 5.2 to 5.4.

## Keep your login private

- `.env` holds your password, so don't email it to anyone or upload it.
- The project is set up so that `.env` is never uploaded to GitHub.
