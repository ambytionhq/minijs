# Using Studio

minijs Studio is where you write, play and share your games. It works the same in your browser and as a desktop app.

- [Browser or desktop?](#browser-or-desktop)
- [Your projects](#your-projects)
- [The workspace](#the-workspace)
- [Files and folders](#files-and-folders)
- [Adding pictures](#adding-pictures)
- [Playing your game](#playing-your-game)
- [The tabs under the game](#the-tabs-under-the-game)
- [Sharing and exporting](#sharing-and-exporting)
- [Where your work is saved](#where-your-work-is-saved)
- [Working offline](#working-offline)
- [Updates](#updates)
- [Keyboard shortcuts](#keyboard-shortcuts)

## Browser or desktop?

| | Browser | Desktop app |
|---|---|---|
| Get it | [minijs.ambytion.net/studio](https://minijs.ambytion.net/studio/) | [Download](https://github.com/ambytionhq/minijs/releases/latest) for Mac, Windows, Linux |
| Saves your projects | Inside the browser, on your computer | Inside the app, or in real folders you choose |
| Open a real folder | Chrome and Edge only, asks permission again after a restart | Yes, no permission prompts |
| Double-click a `.mini` file to open it | No | Yes |
| Export your game as an app | No | Yes |
| Works offline | Yes, after the first visit | Yes |

**Opening the desktop app for the first time:** it isn't signed by Apple or Microsoft yet, so your computer may warn you. On a Mac, right-click the app and choose **Open**. On Windows, click **More info**, then **Run anyway**. You only need to do this once.

## Your projects

The home page shows:

- **New game**: starts a new project with a small starter game in `game.mini`, ready to change.
- **Tutorial**: a 10-minute lesson that builds a platformer one rule at a time, with instructions right beside your code. It remembers which step you were on.
- **Recently edited**: your projects, newest first. Click one to open it. The **⋯** menu on each project has **Rename**, **Duplicate**, **Download zip** and **Delete**.
- **Find your next idea**: three full games (a platformer, an arcade shooter and an adventure). Click **Play** to try one, or open it to read how it was made.
- **Little games to learn from**: small examples, each showing one idea, like clicking, falling rocks or gamepads.
- **Add existing**:
  - **Import a game**: open a `.zip` made with **Export → Whole project** or **Download zip**.
  - **Paste a game**: paste a share link or game code someone sent you.
  - **Open folder**: work straight in a folder on your computer (desktop app, Chrome and Edge). If the folder has no game yet, Studio offers to add a starter one.

**Editing an example:** you can change any example and play your version. Your changes are kept. To make it a project of your own, click **Make my own copy**. To undo your changes to a file, click **Reset this file**.

## The workspace

When you open a project you see:

| Area | What it's for |
|---|---|
| **Left** | The project name, **Share** and **Export**, and the **Files** list. **Your projects** goes back home. **Help** opens a searchable list of everything minijs understands. |
| **Middle** | The open file. Type here. The note at the top tells you when it's saved. |
| **Right** | Your game, and under it four tabs: **Problems**, **Messages**, **Game values** and **Controls**. |

The game restarts on its own a moment after you stop typing, so you see every change right away.

Words minijs knows are colored as you type, and mistakes are underlined. Point at an underline to read what's wrong.

## Files and folders

A project can hold many files: game files ending in `.mini`, pictures, and folders to keep them tidy.

Buttons above the Files list:

| Button | What it does |
|---|---|
| **New game file** | A new `.mini` file |
| **New folder** | A folder |
| **Add files** | Pick files from your computer, like pictures |
| **Reload files** | Re-reads the list. Useful if you changed a real folder outside Studio. |

To **rename**, double-click a file or select it and press **F2**. To **move**, drag it onto a folder. To **delete**, select it and press **Delete**, or click its trash button. A message with **Undo** appears in case it was a mistake.

You can have more than one `.mini` file in a project, for example to try out ideas. The game that plays is the `.mini` file you have open.

## Adding pictures

Drag pictures from your computer onto the Files list, or click **Add files**. Then click a picture to see a preview and the exact line to use it, like:

```mini
thing hero
  looks like "hero.png"
```

minijs finds pictures next to your game file or in an `assets` folder beside it. PNG, JPG, GIF, WebP, SVG, AVIF and BMP all work. See [Pictures and animation](language.md#pictures-and-animation) for animations and tips.

## Playing your game

**Click the game first.** It only hears the keyboard while it's selected. Then use the keyboard, mouse or a gamepad.

| Button | What it does |
|---|---|
| **Play** | Starts the game again with your latest changes |
| **Stop** (square) | Freezes the game |
| **Restart** (circular arrow) | Starts over from the beginning |

Gamepads: connect one, then press any button on it so the browser notices it.

## The tabs under the game

| Tab | What it shows |
|---|---|
| **Problems** | Anything wrong with your game, in plain words, with a hint about how to fix it. Click a problem to jump to its line. The game won't start while there are problems in the file, so fix the first one and the rest often go away. See [Fixing problems](problems.md). |
| **Messages** | Lines written by `log "..."` in your game, plus notes like "Restarted". Players never see these. |
| **Game values** | Every number in your game and how many of each thing exist, updating live. |
| **Controls** | Which keys, mouse buttons and gamepad buttons the game sees as pressed, and your `control`s lighting up. |

**Game values** and **Messages** are the best way to find out why a game isn't doing what you expect. For example, if a "you win" message never appears, watch the score in Game values to see whether it really reaches the number you're checking.

## Sharing and exporting

### Share

Click **Share** to get:

| Option | What the other person gets |
|---|---|
| **Play link** | Opens straight into your game, ready to play, with a full-screen button |
| **Remix link** | Opens your game with its code in Studio, so they can change it and make it theirs |
| **Game code** | Text they can paste into Studio with **Add existing → Paste a game**. Works with no internet. |

The whole game, including its pictures, is packed inside the link itself. Nothing is uploaded anywhere. Very big pictures make very long links, so keep pictures small.

### Export

Click **Export** to download your game:

| Option | What you get |
|---|---|
| **Game as one file** | A single `.html` file that plays in any web browser, even offline. Email it, put it on a USB stick, or upload it to a site like itch.io. |
| **Whole project** | A `.zip` of every file, to back up your work or move it to another computer. Open it again with **Add existing → Import a game**. |
| **Game as an app** (desktop only) | A real app that opens straight into your game, with no editor. Players don't need minijs. Pick a folder, then zip the result to send it. |

Exporting needs a game with no problems. Fix anything in the **Problems** tab first.

People opening an exported app for the first time see the same warning as the desktop app: on a Mac, right-click and choose **Open**; on Windows, **More info**, then **Run anyway**.

## Where your work is saved

Everything saves on its own as you type. You never need to press save, though **Ctrl+S** (or **Cmd+S** on a Mac) saves and runs if you like the habit.

- **In the browser**, projects are stored inside that browser on that computer. They don't follow you to other computers or other browsers. **Clearing your browser's site data for minijs deletes them.** Use **Download zip** or **Export → Whole project** now and then to keep a backup.
- **In the desktop app**, projects are stored by the app on your computer.
- **Opened folders** save straight into that folder, so the files are always right there in Finder or Explorer.

## Working offline

After you've opened Studio once with internet, it works without it. The home page shows **Ready to work offline** when it's ready. Share links and game codes also open without internet, because the game is inside them.

## Updates

- **Browser:** when a new version is ready, Studio shows **Update ready: reload**. Click it whenever you like. Your work is saved first.
- **Desktop app:** the app checks for updates by itself and shows **Install and restart** when one is ready. It saves your work before installing and only restarts when you choose. You can also click **Check for updates** at the bottom of the projects page or in the app's menu.

## Keyboard shortcuts

| Keys | What it does |
|---|---|
| **Ctrl+S** / **Cmd+S** | Save and run |
| **Ctrl+Enter** / **Cmd+Enter** | Run |
| **F2** | Rename the selected file |
| **Delete** | Delete the selected file |
| **Arrow keys** | Move around the Files list |
| **Escape** | Close a window |
