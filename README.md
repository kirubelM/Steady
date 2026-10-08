# Steady

A Windows desktop app for planning your day, focus sessions, screen breaks, distraction nudges and a running log of what you worked on.

## Run it

1. Install Node.js (the LTS version) from https://nodejs.org.
2. Open this folder in a terminal and run `npm install` once.
3. Run `npm start` to launch the app.

To build an installer, run `npm run dist`. The installer appears in the `dist` folder.

## What's new in 1.3

- **Backups and recovery.** Steady backs up your data once a day and keeps 30 days of copies (adjustable). Restore any backup from Settings, or export and import all your data as one file. If your data file is ever damaged, Steady keeps a copy of it and automatically restores the most recent good backup instead of starting over.
- **Problem reports.** Errors are written to a small log. "Copy problem report" in Settings copies the details (no task names or notes) so they're easy to share.
- **Quick capture from anywhere.** Press Ctrl+Shift+Space in any app to add a to-do, something you just did, or a parked thought. Tab switches between them. For done items, end with a time like "20m".
- **Keyboard shortcuts.** Ctrl+K opens a command menu that can do almost anything, including starting focus on a specific task. Press ? to see every shortcut. Ctrl+Alt+Space starts or pauses a session from any app.
- **Repeating tasks.** Open a task and choose Every day, Every weekday, Every week or Every month. It appears on those days automatically. Deleting one day's copy doesn't stop the others; manage them all in Settings.
- **Your calendar on the day page.** Connect classic Outlook or a calendar link, and the Plan page shows your meetings on a timeline, how much free time is left in your workday, and how many sessions fit. You get a reminder 5 minutes before meetings and a heads-up if a session would run into one.
- **Estimate accuracy.** Once you've finished a few tasks with estimates, Steady learns how long things really take you, shows "plan for about N" on the Plan page, and has a new section in Insights.
- **Weekly project goals.** Set hours per week for a project in Settings. Progress shows on the Plan page and in the weekly review, and you get a notification when you reach it.

## What's new in 1.2

- **Projects.** Create projects in Settings (for example "Client A" or "Admin") and attach them to tasks, sessions and log entries. Time adds up per project in Insights and the reviews, and the CSV export has a Project column.
- **A page for every day.** The Plan tab now has a To do list, a Done list where you can add anything you finished (with optional minutes and project), and free notes for the day. Use the arrows to plan tomorrow or look back at earlier days.
- **Edit your log.** Hover any entry in the Work log and click Edit to fix the text, time, length, project or rating. "Add entry" records something you did after the fact, on any date.
- **Interactive Insights.** Hover any bar for details, click a day to see exactly what you did, switch between focus time, all logged time, sessions and on-track rate, step back to earlier periods, filter everything by project, and browse an 18-week focus calendar.
- **Session lengths.** Pick 25, 30, 50 or 90 minutes under the timer (rename or change them in Settings). Each task remembers the length you last used for it, and the break after a session matches its length.
- **Focus sounds.** Brown noise, soft static, rain or ocean waves, made inside the app so they work offline. They fade in when a session starts and fade out when it ends.
- **Dark mode and compact view.** Steady follows your Windows theme, or you can choose light or dark in Settings. The button next to the status line shrinks the window to just the timer; you can also have it switch automatically during sessions.

## A typical day

**Plan.** Steady opens on the Plan tab. Add the few things you want to get done, optionally with a project and an estimate in sessions. Click any task to edit it, move it to another day or set its session length. Unfinished tasks from earlier days wait in "Left over from earlier" until you move them to today. If you left yourself a note in yesterday's review, it shows at the top.

**Focus.** Click Focus next to a task, or click the "Up next" link under the timer. You can also type anything into the focus box; if it matches a planned task, the session is linked to it. Time adds up per task automatically.

**Check in.** When a session ends, log what you got done and how it went. If the session was linked to a task, you can mark that task done right there.

**Break.** A full-screen break covers your monitors. If you're mid-sentence, click "5 more minutes" (up to twice per break by default).

**Review.** At 5:30 PM (adjustable), Steady shows your day: time focused against your goal, what you worked on, what you finished and what's still open. You can move unfinished tasks to tomorrow, leave yourself a note, and copy a summary to paste into an email or chat. On Fridays it shows the whole week instead. You can open the review any time with "Review my day" on the Plan tab or from the tray menu.

## Things that happen automatically

**Calls and presentations.** If an app is using your microphone, or Windows is in presentation mode, Steady holds your break and eye-break reminders until 30 seconds after you're done, so nothing pops up in the middle of a meeting.

**Stepping away.** If you're away from the keyboard for 5 minutes during a session, Steady pauses it from the moment you left. When you come back, it asks whether to resume, count the time anyway, or end the session.

**Daily goal.** The bar under the timer shows today's focus time against your goal (4 hours by default). You get a notification when you reach it, and the Insights chart shows the goal as a dashed line.

**Eye breaks.** Every 20 minutes during a session, a notification reminds you to look about 20 feet (6 m) away for 20 seconds.

**Logging between sessions.** Every 30 minutes without a session, Steady asks what you've been working on, unless you've been away.

**Distraction nudges.** If the window you're using matches one of your keywords (YouTube, Reddit and so on) mid-session, you get a reminder of your task.

## The tray and the mini timer

Closing the window keeps Steady running in the system tray (the ring icon near the clock, which fills up as your session goes). Click it to open Steady; right-click it to start, pause or end a session, take or skip a waiting break, toggle the mini timer, open your review or quit.

The mini timer is a small floating window that stays on top of other apps during focus sessions. Drag it anywhere; it remembers where you put it. Its buttons pause or resume, open Steady, or hide it until the next session. In Settings you can show it always, only during sessions, or never.

## Other features

**Parking lot.** Press Ctrl+Shift+Space from anywhere to jot down a stray thought. Later, click "Add to today's plan" to turn it into a task.

**Work log.** Day view shows a timeline for any date. History view lists what you worked on each day and lets you search everything, for example "budget".

**Insights.** Focus time per day, your best hours, top apps, distraction trends, breaks and streaks, over 7, 30 or 90 days.

**Site blocking (optional).** Blocks sites completely during sessions by temporarily editing the Windows hosts file. This needs Steady to run as administrator. The block is removed after each session, when you quit, and on startup.

**Start at sign-in.** In the installed version, go to Settings, then Startup, and tick "Open Steady when I sign in to Windows". With "Start quietly in the system tray" ticked, it starts in the tray without opening a window.

## Connecting your calendar

Go to Settings, then Calendar.

- **Classic Outlook (desktop app):** choose "Classic Outlook on this computer". Steady reads your calendar directly from Outlook on your PC; nothing is sent anywhere. Outlook may open in the background the first time.
- **New Outlook, Outlook.com or Microsoft 365 on the web:** in Outlook on the web, go to Settings, then Calendar, then Shared calendars, and under "Publish a calendar" choose your calendar and "Can view all details". Copy the ICS link into Steady.
- **Google Calendar:** open the calendar's settings and copy "Secret address in iCal format".

Click "Test connection" to check it, then set your working hours so Steady knows how much focus time you have. Published links can take a while to show changes, depending on your calendar provider.

## Backups

Backups are in `%APPDATA%\Steady\backups`, one per day plus any you save yourself. The error log is in `%APPDATA%\Steady\logs`.

## Privacy

Everything stays on your computer, apart from fetching your calendar link if you set one up. Window titles are checked in memory and never saved; only app names, time spent and which keyword matched are stored. Microphone use is only checked to see whether any app is using it, never recorded. Your data is in `%APPDATA%\Steady\steady-data.json`.

## Troubleshooting

If notifications don't appear, check that Do Not Disturb is off and that notifications are allowed for Steady (or Electron, while running with `npm start`) in Windows Settings, under System, then Notifications.

If breaks keep waiting even though you're not in a call, an app may be holding the microphone open. Turn off "Hold breaks and reminders while I'm in a call" in Settings, or check which app is using the microphone in Windows Settings, under Privacy and security, then Microphone.
