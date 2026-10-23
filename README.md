# Steady

A Windows desktop app for planning your day, focus sessions, screen breaks, distraction nudges and a running log of what you worked on.

## Run it

1. Install Node.js (the LTS version) from https://nodejs.org.
2. Open this folder in a terminal and run `npm install` once.
3. Run `npm start` to launch the app.

To build an installer, run `npm run dist`. The installer appears in the `dist` folder.

Run `npm test` to check the app's logic (tasks, subtasks, repeating tasks, calendars, saved-data upgrades, streaks and milestones) and that every file the app needs is included in the installer. The tests also run on GitHub for every push, and a release is only built if they pass.

## Release notes

Each GitHub release includes the matching **What's new in VERSION** section below.

**Releasing is automatic.** To ship a new version, change `version` in package.json and add a matching `## What's new in X.Y.Z` section here, in the same commit or pull request. When that reaches master, the Release workflow checks the notes, runs the tests, tags the commit `vX.Y.Z`, builds the installer and publishes the release; Steady's auto-update then picks it up. Pushes that don't change the version publish nothing. Tagging by hand still works, but isn't needed.

## What's new in 1.19.0

- **A calmer, more polished design.** Page titles use a display face, text follows one consistent type scale, and every card shares the same shape, border and shadow with more room inside and between. Color is calmer: the accent marks titles and the main action, project chips are softer, and the moving backdrop and pointer glow are subtler. The Notion, Linear and Things looks keep their own style.

## What's new in 1.18.0

- **A livelier look.** The tabs have icons and a marker that glides to the one you pick. A soft backdrop in your accent color drifts slowly behind the page, cards light up where your pointer is, buttons ripple when pressed, and primary buttons shine on hover.
- **Confetti.** Ticking off a task, subtask or parked item sends up a little burst. Finishing everything on today's plan sends up a big one.
- **Your choice.** Turn it all off in Settings > Appearance > Lively effects. It also stays off when motion is reduced.

## What's new in 1.17.14

- **Project suggestions while you type #.** The Plan page's task box, the Done box, the Parking lot box, check-ins and log entries now offer your projects as soon as you type #, the way quick capture does. Arrow keys move, Tab or Enter picks, Esc closes.

## What's new in 1.17.13

- **`#project` in check-ins.** Type `#Acme` in a check-in, a missed check-in or an added log entry to file it under that project, the same as in quick capture.

## What's new in 1.17.12

- **Sort the left-over tasks.** The "Left over from earlier" box has a Sort menu: oldest first, newest first, by project or A to Z. Your choice is remembered.

## What's new in 1.17.11

- **Left-over rows.** The "Move to today" button now sits clear of the row's border, and how long ago a task was planned ("8 days ago") is bold red.

## What's new in 1.17.10

- **More room on the left-over rows.** The "Move to today" button now has space between it and the task text.

## What's new in 1.17.9

- **"Left over from earlier" stands out.** Unfinished tasks from earlier days now sit in their own amber box with a count, each showing how long ago it was planned, and a proper "Move all to today" button.

## What's new in 1.17.8

- **How to read the calendar.** A short, collapsible "How to read this" guide under the Day tab calendar explains what you are looking at: planned vs done, the ✓ pill, the Done side, the combined list and how to schedule tasks. It changes with the view and options you have on.

## What's new in 1.17.7

- **Solid means done.** In the combined Day and Week list, planned tasks are hollow cards with a dashed outline, and anything done (finished tasks, sessions, check-ins, logged work) is a filled card with a solid bar. The Done column no longer uses a dashed bar for check-ins.

## What's new in 1.17.6

- **Combine planned and done.** With View > Show what's done on, a new View > Combine planned and done puts both in one stacked list for each day, in time order, instead of splitting each day in two. Planned tasks, ticked tasks, sessions, check-ins and meetings each get a readable card with its time and a label. It works in Day and Week view.

## What's new in 1.17.5

- **What you did, in the Week view.** View > Show what's done now works in the Week view too. Each day gives its right side to its sessions, check-ins and finished things, with ticked tasks gathered into one pill. Hover for details, click to edit, or click a pill to open that day in the work log.

## What's new in 1.17.4

- **Finished plans stay on the calendar.** A task with a set time no longer vanishes from the Day tab when you tick it off. It stays in its slot, ticked and dimmed, in both the Day and Week views, and no longer counts as busy time.

## What's new in 1.17.3

- **App insights, on their own.** The Day tab no longer squeezes your apps into a column beside the calendar. View > Show app insights adds a section under the calendar listing every app for the day (or the whole week in Week view): time and share, number of stretches, the longest one, time on distractions and the main windows.

## What's new in 1.17.2

- **Project suggestions in every quick capture tab.** Typing # in the Done and Park tabs now offers your projects, just like Todo. Tab or Enter picks one.

## What's new in 1.17.1

- **Readable apps on the Day tab.** With "Show apps" on, the Apps column is wider and shows labelled blocks (the main app in each 15 minutes, with the full mix on hover) instead of hairline stripes.
- **A tidier Done column.** Tasks you tick off in a burst now show as one "✓ N done" pill (click it to open the work log) instead of squeezing everything else into thin columns.

## What's new in 1.17.0

- **Projects in the Parking lot.** Park items can have a project: pick one next to the box or type `#project`. Filter the list by project and sort it newest, oldest, by project or A to Z.
- **`#project` in quick capture.** Type `#Acme` in the Done and Park tabs (and in the Plan page's Done box) to file an item under that project. It matches an existing project by name, or creates one.
- **Change when something was finished.** Tasks have a "Finished on / at" date and time in the task editor, and parked items have an Edit button with the same. Set it when you tick Done, or fix it later; the work log follows.
- **Move things between the plan and the Parking lot.** Tasks have "Move to parking lot", and parked items have "Move to today's plan".
- **Readable apps in the work log.** Each app used in a session is now its own chip with its time, instead of tiny run-together text.

## What's new in 1.16.1

- **Your app history is kept forever.** The app timeline now keeps every day unless you choose otherwise in Settings > App timeline. If you were on the old 30-day default, Steady switches you to forever; a period you pick yourself stays as you set it.

## What's new in 1.16.0

- **Looks.** Pick a whole style in Settings > Appearance: Classic, Notion-style, Linear-style or Things-style, each with a light and a dark version. A look changes colors, surfaces, corners and titles together. With the Pine accent each look uses its own accent; pick another accent to use yours.
- **One set of icons.** Buttons across the app now use matching outline icons.
- **A tidier Day tab.** Show what's done, Move done items and Show apps are in a View menu, and Schedule my day is the main button at the top.
- **A menu on every task.** Click ⋯ on a task or subtask, or right-click it, to focus, schedule, star, add a note or subtask, move it to today, tomorrow or next week, make it a subtask of another task, duplicate it or delete it (with Undo).
- **Notes right in the list.** Use the note button on a task to write a note under it without opening the editor.
- **Fold away the timer.** The button at the top of the timer panel (or Ctrl+Backslash) folds it to a slim bar while you're not focusing, with a start button and today's focus time. It opens again when a session starts.
- **Easier settings.** Distractions is split into Sites and apps, Focus protection and App timeline, and a search box finds any setting.
- **Fix.** Pressing Ctrl+Enter in a note box no longer starts a focus session.

## What's new in 1.15.2

- **Make a subtask a task of its own.** Use the ↗ button on a subtask to turn it into a task, placed right after its parent. If the parent has a project, Steady asks whether to keep it. The new task keeps the subtask's note and whether it was done, and time you already spent on it moves with it. Undo puts it back.
- **Notes for follow-ups.** Add a note to a task in its editor, or to a subtask with its ✎ button, for things like who to follow up with and when. Notes show under the task or subtask; click one to edit it. They stay with a task when it becomes a subtask and back.

## What's new in 1.15.1

- **Project suggestions in quick capture.** Type # in the To do box of quick capture (Ctrl+Shift+Space) and your projects show up under it. Use the Up and Down arrows to choose and Tab or Enter to pick.
- **Window titles on the app timeline.** The timeline now notes the window you were in, not just the app. Hover a stretch in the apps lane on the Day tab to see its main windows; the summary beside it shows each app's most-used window.
- **Keep your app history as long as you like.** In Settings > Distractions, keep the timeline for a week, 30 days, 90 days, a year or forever, or delete it. It's now stored in its own files, so a long history doesn't slow Steady down.

## What's new in 1.15.0

- **Smarter quick add.** Type a day, a repeat, a project and a star along with a task, in the Plan box or quick capture (Ctrl+Shift+Space): "Send invoice fri 2pm 1h #client ! every week". Steady understands days like tomorrow, fri, next week, oct 31 or in 3 days, and repeats like every weekday, every friday or monthly. A line under the box shows what it will do before you press Enter, and repeating tasks keep their time on later days.
- **Schedule my day.** One click on the Day tab gives every task without a time the next free time in your working hours, around your meetings, starred and due tasks first. Blocks you missed earlier move forward, and Steady tells you if anything didn't fit. Undo puts it all back. In the Week view it schedules each day from today on.
- **An all-day app timeline.** Turn on "Show apps" on the Day tab to see which apps you used through the day beside your plan, with time per app, time on distractions and how often you switched apps. Steady keeps only app names and times, never window titles, on this computer for 30 days. You can turn it off in Settings > Distractions.
- **Do not disturb.** New options in Settings > Distractions, all off until you turn them on: silence Windows notifications during focus sessions, minimize apps you list (like Discord) if you open them while focusing, and a strict mode that won't let a session end early after its first minute.

## What's new in 1.14.0

- **Make a task a subtask by dragging.** Hold Ctrl+Shift, then drag a task onto another one to make it a subtask. It works in the Plan list, the Day tab's "No time yet" list and on the Day calendar. Its own subtasks and logged focus sessions move with it, and Undo puts everything back.
- **See which drag you're doing.** A plain drag reorders the list, and a bar slides in where the task will land. A Ctrl+Shift drag shows the task under your cursor with a "Make subtask" badge on the task it will go into.
- **Move done items on the Day tab.** With "Show what's done" on, turn on "Move done items" to drag sessions, check-ins, logged work and finished tasks to the time they really happened, or nudge one with the Up and Down arrow keys. They keep their length and can't move into the future.

## What's new in 1.13.0

- **Color themes.** Settings > Appearance has seven: Steady, Paper (warm cream), Nord (cool blue-grey), Forest, Rosé, Pure (white, or true black in dark mode) and High contrast. Each has a light and a dark version, and they work with any accent color.
- **High contrast.** Black and white with solid borders, underlined links and a thick keyboard focus outline.
- **Style options.** Choose rounded or sharp corners, comfortable or compact spacing, and a font: Segoe, Serif, Classic (Verdana) or Monospace.
- **Timer styles.** The focus timer can be the classic ring, a thin ring, a segmented ring like a clock face, or a big clock with a slim progress bar.
- **Try before you save.** Appearance changes show as soon as you pick them; press Save to keep them, or leave Settings to go back.
- **A better Refresh calendar button.** It shows when your calendar last updated, spins while it loads, confirms when it's done and says what went wrong if it can't connect. It's on the Plan page's Schedule card too, and offers to connect a calendar when none is set up. The Day tab now updates as soon as a refresh finishes.
- **More room on the Day tab.** The "No time yet" list now sits beside the calendar in the Day view, the Week view and with "Show what's done" on, and the Day tab uses more of a wide window. The list only moves above the calendar when the window is too narrow for both.

## What's new in 1.12.2

- **Week view.** The Day tab has a Day / Week switch. The week view shows Monday to Sunday side by side: drag a task between days as well as hours, drop tasks from the "No time yet" list onto any day, and click a day's heading to open it. With a task selected, Left and Right move it a day.
- **Type a time when you add a task.** "Write report 2pm 1h", "Standup 9:15am for 15 min" or "Design review 2-3:30pm" adds the task and schedules it in one go. A line under the box shows what will be scheduled before you press Add.
- **Missed tasks get a second chance.** When a scheduled task's time passes and it isn't done, Steady offers to move it to the next free time that fits. Missed tasks are marked on the Day view and listed on the Plan page, each with "Next free time" and "Tomorrow" buttons.
- **Plan vs. done in your review.** The end-of-day review shows how much you planned against what you logged, and which scheduled tasks got done or slipped.
- **A heads-up before scheduled tasks.** Steady reminds you 5 minutes before a scheduled task starts. In Settings, under Calendar, you can also have focus start automatically when a task's time comes, as long as nothing else is running.

## What's new in 1.11.0

- **See what you actually did on the Day view.** Tick "Show what's done" on the Day tab to split the calendar into Planned and Done. Focus sessions, check-ins and work you logged appear at the times they happened, and finished tasks show as a tick at the time you completed them. Click any of them to edit it. Steady remembers whether the switch is on.

## What's new in 1.10.0

- **What's new inside Steady.** After an update, a screen opens once with everything new since the version you last used and can be reopened from Settings > Help and about > What's new. It uses the same version notes as the GitHub release.

## What's new in 1.9.0

- **Day view.** A new Day tab shows the day as an hour-by-hour calendar with your meetings, scheduled tasks and a line for now. Drag a task from the "No time yet" list onto an hour, or click "Next free time". Drag a block to move it, drag its bottom edge to change its length, or drag it back to the list to clear its time. Everything snaps to 15 minutes, and things at the same time sit side by side. With a block selected, the arrow keys move it, Shift with the arrows changes its length and Delete clears it.
- **Schedule a task from its row.** On the Plan tab, the clock next to a task sets a start time and length, suggesting the first free slot. Once set, the time shows on the task.
- **A lighter Plan page.** The Schedule card is now a short summary of your free time and what's on now or next, with a link to the Day view.
- **Reordering tasks lands where you drop.** Dragging a task, or Alt+Up and Alt+Down, now follows the order you see, even with starred or due tasks pinned at the top.
- **New tab shortcuts.** Ctrl+2 opens the Day view; Work log, Insights, Parking lot and Settings move to Ctrl+3 through Ctrl+6.

## What's new in 1.8.0

- **Choose your motion.** In Settings > Appearance and startup, choose Follow Windows, Full motion, or Reduced motion. Full motion enables existing animations even when Windows reduces them. Your choice applies to the main window, mini timer and break screens.
- **Parking lot history.** Open and Completed items are separate. Completed items are grouped by completion day, newest first, with collapsible day groups, Edit log and Reopen controls.
- **A fuller daily work log.** Parking completions and newly completed subtasks join completed tasks, check-ins, focus sessions and manual entries. Parking completions also appear in Plan's Done list, history and CSV exports. Clearing the parking list preserves saved completion history; reopening an item removes its completion marker. Completion markers add no duplicate time. Older undated parking and subtask completions cannot be assigned to a day reliably.
- **Cleaner Done editing.** Completed work uses rounded cards, time badges and a single Edit control. Grouped activity opens a chooser for the task, sessions or check-ins you want to change.
- **Release feature notes.** GitHub releases include the features and fixes added in that version.

## What's new in 1.7.0

- Record missed work from Work log > Missed check-in: choose a day's to-do, enter minutes, and save. Between-session check-ins also ask how long you worked and can complete the selected task.
- Edit tasks, sessions, check-ins and manual entries directly from Plan's Done section. Work log edit buttons stay visible.
- Completed to-dos appear in the work log and history as completion markers without adding duplicate time.
- Zoom with Ctrl+plus (or Ctrl+=), Ctrl+minus, Ctrl+0 to reset, or Ctrl+mouse wheel.
- Rose, Indigo and Sunflower accents, a tinted panel, animated dialogs and responsive cards. Reduced-motion preferences are respected.

## What's new in 1.6.1

- **A clearer work log.** Each kind of entry has its own color, icon and label. Focus sessions are solid cards (with the project's color on the edge), check-ins are soft blue cards, things you added yourself are dashed violet cards, and breaks are slim amber strips (skipped ones greyed out). Session goals show on their session with whether you reached them. Chips at the top filter by type and show how many of each there were.

## What's new in 1.6

- **Time-blocking.** Drag a task from your list onto the schedule's timeline to reserve time for it, or set a time in the task editor. Blocks show on the timeline in the project's color, count against your free time, and can be dragged to a new time or removed with ×. When a block starts, Steady reminds you and offers to start a session.
- **Plan my day.** On today's page, "Plan my day" gathers leftovers, tasks due soon but planned for later, and parked thoughts. It ticks what fits in your free time (urgent ones always), and adds your choices to today.
- **Due dates and stars.** Give a task a due date in the task editor and star the important ones (☆ on each task). Starred and overdue tasks rise to the top, "Overdue by a day" and "Due today" labels show on tasks, the Tasks tile counts them, and there's a new "Priority" sort.
- **Session goals.** Before a session, optionally write what done looks like. It shows under the timer, the check-in asks whether you got there, and your hit rate appears in the daily review and Insights.
- **What's next after a break.** When a break ends, Steady offers to start the task you were on (or the top of your list). It never starts on its own, and you can turn the prompt off in Settings, then Breaks.
- **A welcome for new installs.** A first launch on a fresh install walks through setting a daily goal, a first project and task, and starting a session.

## What's new in 1.5.1

- **Sturdier data loading.** If the data file is damaged in an unusual way (for example it holds nothing but `null`), Steady now loads with defaults instead of failing to start.
- **Automatic checks.** 46 tests run on every change and before every release, so mistakes are caught before an update reaches you.

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

**Day view.** The Day tab shows the day (or, with the Week switch, the whole week) as a calendar: your meetings, the tasks you've given a time, and a red line for now. Drag a task from the "No time yet" list onto an hour to schedule it, or click "Next free time". Drag a block to move it, drag its bottom edge to make it longer or shorter, or drag it back to the list to clear its time; everything snaps to 15 minutes. With a block selected, the arrow keys move it, Shift with the arrows changes its length and Delete clears it. Click a block to edit the task. Tick "Show what's done" to see your focus sessions, check-ins, logged work and finished tasks in a Done column next to the plan. On the Plan tab, the clock next to a task sets its time too, and the Schedule card sums up your free time and what's next.

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
