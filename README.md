# Steady

A Windows desktop app for planning your day, focus sessions, screen breaks, distraction nudges and a running log of what you worked on.

## Run it

1. Install Node.js (the LTS version) from https://nodejs.org.
2. Open this folder in a terminal and run `npm install` once.
3. Run `npm start` to launch the app.

To build an installer, run `npm run dist`. The installer appears in the `dist` folder.

## What's new in 1.5

- **Accent colors.** Choose Pine, Ocean, Plum, Terracotta or Graphite in Settings, then Appearance and startup. Buttons, rings, charts and the focus background all follow it.
- **Sessions in project colors.** During a session on a project, the timer and mini timer take on that project's color. Turn this off in Appearance if you prefer the accent.
- **Time-of-day tint.** A faint wash over the page shifts from cool morning light to warm evening light. You can turn it off.
- **A calmer break screen.** A slow dusk sky, a breathing circle behind the countdown ("breathe in" for 4 seconds, "breathe out" for 6), and tips that fade in.
- **A livelier mini timer.** It matches the accent and project color, glows during focus, turns amber on breaks, and a thin edge around it fills as the session goes.
- **Your day as a story.** The daily review shows the day as a strip of colored sessions and breaks, and points out your best uninterrupted stretch of focus.
- **Soft chimes.** Optional bell tones when a session ends, a break ends or you finish a task. Off by default; turn them on in Appearance.
- **Friendlier empty pages.** Small drawings and helpful text when there's nothing planned, logged or parked yet.
- **Milestones.** 7, 30 and 100-day streaks and 10 to 500 hours of focus are noted in that day's review, with your progress toward the next ones in Insights.
- **Richer Insights.** Daily bars split by project color, a dashed line comparing with the previous period, and a "When you focus" grid by day of the week and hour.
- **Cards that stand apart.** Each section sits on its own clearly separated card, with an accent marker next to its title.
- **More motion.** Opening a tab, day or Settings category brings the cards in one after another. Bars, rings and charts grow into place, subtasks slide open, dialogs and messages ease in, and buttons give a little when pressed. Windows' "reduce animations" setting turns all of it off.

## What's new in 1.4.1

- **Site blocking without running as administrator.** Go to Settings, then Distractions, and click "Allow site blocking" once. Windows shows one admin prompt, and blocking then keeps working after updates and restarts. "Remove permission" undoes it. Before, running Steady as administrator didn't help if Steady was still open in the tray, and updates reopened it without admin rights.

## What's new in 1.4

- **A timer that shows how you're doing.** During a session, the timer pane has a slowly moving green background and the ring glows softly. When paused, the color drains and the ring pulses. Breaks turn the pane warm amber. Once you reach your daily goal, the ring turns gold, with a short celebration the moment you hit it.
- **A livelier Plan page.** A greeting ("Good morning. 4 tasks and 5 h free today."), a big day heading with the date beside it, and numbers in the tiles that count up when you open the page.
- **Ticking off tasks.** The checkbox fills with the project's color, the text strikes through, and the task settles into the finished group. New tasks ease in.
- All of this follows Windows' "reduce animations" setting: with it on, everything changes instantly.

## What's new in 1.3.9

- **Filter and sort your To do list.** Show one project's tasks (or those without a project), sort by your own order, project, most sessions left, least progress, name or newest, and hide finished tasks. Steady remembers your choice. Dragging works in "My order" with all projects shown; "Reset" puts everything back.

## What's new in 1.3.8

- **Drag to reorder tasks.** Drag a task in the To do list straight to where you want it; a line shows where it will land. With a task selected, Alt+Up and Alt+Down move it one step. This replaces the up and down arrow buttons.

## What's new in 1.3.7

- **Settings by category.** Settings are grouped into Focus, Breaks, Projects and tasks, Calendar, Distractions, Appearance and startup, Data and backups, and Help and about, and you see one group at a time. Steady remembers the last group you opened.
- **Version number.** The version shows at the bottom of the timer pane and under Settings, then Help and about, then About Steady, where "Check for updates" checks right away.
- **More reliable updates.** If an update check fails, for example because you were offline, Steady tries again after 10 minutes instead of 6 hours, and checks again when your PC wakes from sleep.

## What's new in 1.3.6

- **Less clutter on the Plan page.** The "sessions left" estimate moved into the Tasks tile. With no meetings, the schedule is a single line instead of an empty timeline. Tasks show just their project and repeat, with the progress bar covering sessions. The move-up, move-down and add-subtask buttons appear when you hover a task; Focus is always there.
- **Simpler forms.** The estimate picker shows only while you're adding a task, and the Done list's form is behind a "+ Log something you did" link.
- **Calmer timer pane.** The status line only appears during sessions and breaks. The volume slider only shows when a focus sound is on, and the shortcut hint is now a small "Keyboard shortcuts" link.

## What's new in 1.3.5

- **Smoother scrolling.** Scrollbars are slim and match the app's colors, with no arrow buttons, and they only show while you hover or scroll. The tab bar gets a soft shadow when a page scrolls under it, content stays centered in wide windows, and nothing shifts sideways when a scrollbar appears.
- **Dialogs.** In long dialogs, the Save and Cancel buttons stay pinned to the bottom.
- **Fix.** Subtasks in the task editor were laid out wrong in 1.3.4: the checkboxes were stretched and the text boxes squashed.

## What's new in 1.3.4

- **Focus on one subtask.** Hover a subtask and click ▶ to start a session on just that step. When the session ends, the check-in offers to tick that subtask off.
- **Subtasks under the timer.** While you focus on a task, its subtasks appear under the timer so you can tick them off without leaving the timer.
- **Rename and reorder.** Click a subtask to rename it, and drag it by the dotted handle to reorder.
- **Finishing up.** When you tick the last subtask, Steady offers to mark the whole task done.
- **Tidier list.** A small counter (for example 2/4) shows progress at a glance, and "+ Add subtask" opens the add box only when you need it.

## What's new in 1.3.3

- **Today at a glance.** The top of the Plan page shows your focus time against your goal, how many tasks are done, your next meeting (or how many sessions you've done, without a calendar) and your streak.
- **A cleaner look.** Plan and Insights sections sit on their own cards. Each task has a stripe in its project's color and a progress bar for its subtasks or sessions, and the daily goal bar fills with color.
- **Timer fits the window.** The timer scales with the window height, so you don't have to scroll to see it.
- **Mini timer link.** The link under the timer now says "Show mini timer" or "Hide mini timer".

## What's new in 1.3.2

- **Subtasks.** Click + next to a task to break it into smaller steps, then tick them off on the Plan page. "Hide subtasks" and "Show subtasks" collapse the list and show how many are done. You can also add, rename, tick or remove subtasks in the task editor. On a repeating task, subtasks set in the task editor come back unticked each day.
- **Clearer tray menu.** The tray menu now says "Show Steady" or "Hide Steady", and "Show mini timer" or "Hide mini timer", depending on what's on screen.
- **Scrolling fix.** Scrolling a page no longer runs past the end into empty space.

## What's new in 1.3.1

- **More than one calendar.** Connect classic Outlook and any number of calendar links (for example a work Outlook calendar and a personal Google Calendar). Their meetings are combined on the Plan page, labelled with the calendar they came from, and a meeting that appears in two calendars is shown once. If one calendar can't be reached, the others still show. Your existing calendar carries over automatically.
- **Automatic updates.** Steady checks for new versions in the background and installs them the next time it quits. To install right away, choose "Restart to update" in the tray menu.

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

Closing the window keeps Steady running in the system tray (the ring icon near the clock, which fills up as your session goes). Click it to open Steady; right-click it to start, pause or end a session, take or skip a waiting break, show or hide Steady and the mini timer, open your review or quit.

The mini timer is a small floating window that stays on top of other apps during focus sessions. Drag it anywhere; it remembers where you put it. Its buttons pause or resume, open Steady, or hide it until the next session. In Settings you can show it always, only during sessions, or never.

## Other features

**Parking lot.** Press Ctrl+Shift+Space from anywhere to jot down a stray thought. Later, click "Add to today's plan" to turn it into a task.

**Work log.** Day view shows a timeline for any date. History view lists what you worked on each day and lets you search everything, for example "budget".

**Insights.** Focus time per day, your best hours, top apps, distraction trends, breaks and streaks, over 7, 30 or 90 days.

**Site blocking (optional).** Blocks sites completely during sessions by temporarily editing the Windows hosts file. The first time, go to Settings, then Distractions, and click "Allow site blocking": Windows shows one admin prompt, after which Steady can edit the hosts file without running as administrator ("Remove permission" undoes it). New sites are blocked right away; one already open in your browser may keep loading for about a minute. The block is removed after each session, when you quit, and on startup.

**Start at sign-in.** In the installed version, go to Settings, then Startup, and tick "Open Steady when I sign in to Windows". With "Start quietly in the system tray" ticked, it starts in the tray without opening a window.

## Connecting your calendar

Go to Settings, then Calendar, choose where the calendar comes from, give it a name (for example "Work" or "Personal") and click "Add calendar". Steady checks the connection before adding it. Repeat for each calendar you want to see; use Test next to a calendar to check it again, or × to remove it.

- **Classic Outlook (desktop app):** choose "Classic Outlook on this computer". Steady reads your calendar directly from Outlook on your PC; nothing is sent anywhere. Outlook may open in the background the first time.
- **New Outlook, Outlook.com or Microsoft 365 on the web:** in Outlook on the web, go to Settings, then Calendar, then Shared calendars, and under "Publish a calendar" choose your calendar and "Can view all details". Copy the ICS link into Steady.
- **Google Calendar:** open the calendar's settings and copy "Secret address in iCal format".

Set your working hours so Steady knows how much focus time you have. Steady refreshes your calendars about every 10 minutes, or right away with Refresh on the Plan page. Classic Outlook changes show up on the next refresh; published links can take anywhere from minutes to several hours to show changes, depending on your calendar provider.

## Backups

Backups are in `%APPDATA%\Steady\backups`, one per day plus any you save yourself. The error log is in `%APPDATA%\Steady\logs`.

## Privacy

Everything stays on your computer, apart from fetching your calendar link if you set one up. Window titles are checked in memory and never saved; only app names, time spent and which keyword matched are stored. Microphone use is only checked to see whether any app is using it, never recorded. Your data is in `%APPDATA%\Steady\steady-data.json`.

## Troubleshooting

If notifications don't appear, check that Do Not Disturb is off and that notifications are allowed for Steady (or Electron, while running with `npm start`) in Windows Settings, under System, then Notifications.

If breaks keep waiting even though you're not in a call, an app may be holding the microphone open. Turn off "Hold breaks and reminders while I'm in a call" in Settings, or check which app is using the microphone in Windows Settings, under Privacy and security, then Microphone.
