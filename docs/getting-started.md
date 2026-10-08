# Getting started

This page takes you from nothing to a game you can play and share. It takes about 15 minutes. You do not need to know how to code.

- [What is minijs?](#what-is-minijs)
- [Open minijs Studio](#open-minijs-studio)
- [Your first game, step by step](#your-first-game-step-by-step)
- [What to do next](#what-to-do-next)

## What is minijs?

minijs is a way to make small 2D games by writing plain sentences. A game is one text file that ends in `.mini`. In it you say two kinds of things:

1. **What is in the game.** "There is a player. It looks like an orange box. It starts here."
2. **What happens.** "When the right arrow key is held, move the player right."

That's it. No brackets, no semicolons, no special symbols to remember. If you write something minijs doesn't understand, it tells you in plain words what is wrong and how to fix it.

## Open minijs Studio

minijs Studio is where you write and play your games. Pick one:

| Option | Best for | How |
|---|---|---|
| **In your browser** | Trying it right now | Go to [minijs.ambytion.net/studio](https://minijs.ambytion.net/studio/). Nothing to install. |
| **Desktop app** | Working with real folders on your computer | [Download it](https://github.com/ambytionhq/minijs/releases/latest) for Mac, Windows or Linux. |

Both versions save your work on their own and keep working without internet once they have loaded.

> **First time opening the desktop app?** It is not signed by Apple or Microsoft yet, so your computer may warn you.
> On a **Mac**, right-click the app, choose **Open**, then **Open** again.
> On **Windows**, click **More info**, then **Run anyway**.
> You only need to do this once.

When Studio opens you see **Your projects**. Click **Start the tutorial** if you want Studio to walk you through the same game as below, one step at a time, right next to your code. Or follow along here.

## Your first game, step by step

We will build a tiny platformer: a box that runs, jumps and collects coins.

Click **New game**, give it a name, and click **Create**. You now see three areas:

- **Files** on the left.
- **Your game file** in the middle. This is where you type.
- **The game** on the right. It restarts by itself every time you type.

The file starts with a small example game. Select all of it and delete it so the file is empty, then follow each step. After each step, look at the game on the right.

### Step 1: Paint the sky

Type this:

```mini
game
  size 320 by 180
  background sky blue
```

The game turns light blue.

- `game` starts the game's settings.
- The two lines under it are **indented** (pushed in with spaces). Indenting means "this belongs to the line above." Use the same number of spaces every time. Two is fine.
- `size 320 by 180` is how many pixels wide and tall the game is.

### Step 2: Make a hero

Add these lines at the bottom. The `thing` line is **not** indented, because it is a new block:

```mini
thing player
  looks like orange box 12 by 16
  starts at 40, 100
```

An orange box appears.

- `thing player` makes a kind of thing called `player`. You choose the name.
- `looks like orange box 12 by 16` is its look: an orange rectangle 12 pixels wide and 16 tall.
- `starts at 40, 100` puts it 40 pixels from the left edge and 100 pixels down from the top.

> **Where is 0, 0?** The top-left corner. Bigger first numbers go right. Bigger second numbers go **down**.

### Step 3: Make it move

Add two rules:

```mini
when left key is held
  move player left 2

when right key is held
  move player right 2
```

Click the game, then press the left and right arrow keys. The box moves.

A rule starts with `when` and says what should happen. The indented lines under it are what to do. `held` means "every moment the key is down." `move player right 2` moves it 2 pixels each moment, which is 120 pixels a second.

> **Nothing happens when you press keys?** Click on the game first. The game only hears the keyboard when it is selected.

### Step 4: Gravity and ground

Add `gravity 0.4` to the `game` block, and add `solid` and `falls` to the player. Then add a ground. Your whole file now looks like this:

```mini
game
  size 320 by 180
  background sky blue
  gravity 0.4

thing player
  looks like orange box 12 by 16
  starts at 40, 100
  solid
  falls

thing ground
  looks like sea green box 320 by 20
  starts at 0, 160
  solid
  fixed

when left key is held
  move player left 2

when right key is held
  move player right 2
```

The player drops and lands on the ground.

- `falls` means gravity pulls it down.
- `solid` means solid things can't pass through each other. Both the player and the ground need it.
- `fixed` means the ground never gets pushed around, even when the player lands on it.

### Step 5: Jump

Add this rule:

```mini
when up key is pressed and player is on ground
  push player up 7
```

Press the up arrow to jump.

- `pressed` happens once, at the moment the key goes down. (`held` would happen every moment.)
- `and player is on ground` is a condition. Without it you could jump in mid-air forever.
- `push` gives the player speed in a direction. Gravity then slows it down and brings it back.

### Step 6: Coins and score

Add a number to keep score. Put this line near the top, under the `game` block:

```mini
score starts at 0
```

Then add a coin and two rules:

```mini
thing coin
  looks like gold circle 4

when every 2 seconds
  make a coin at random 10 to 300, 140

when player touches coin
  remove the coin
  add 1 to score
```

- The coin has no `starts at` line, so no coins exist at the start. `make a coin` creates a new one.
- `random 10 to 300` picks a different number each time, so coins appear in different places.
- In a `touches` rule, `the coin` means *the exact coin that was touched*, not every coin.

### Step 7: Show the score

```mini
always
  show text "Score: {score}" at 4, 4
```

`always` runs every moment. The `{score}` part is replaced with the actual number.

### Step 8: Win the game

```mini
when score is 10
  show text "You win!"
  stop game
```

`when score is 10` happens once, the moment the score reaches 10. `show text` with no position puts the words in the middle of the screen. `stop game` freezes everything.

Press the **Restart** button (the circular arrow above the game) to play again.

### The finished game

Here is everything together. If something isn't working, compare your file with this one.

```mini
game
  size 320 by 180
  background sky blue
  gravity 0.4

score starts at 0

thing player
  looks like orange box 12 by 16
  starts at 40, 100
  solid
  falls

thing ground
  looks like sea green box 320 by 20
  starts at 0, 160
  solid
  fixed

thing coin
  looks like gold circle 4

when left key is held
  move player left 2

when right key is held
  move player right 2

when up key is pressed and player is on ground
  push player up 7

when every 2 seconds
  make a coin at random 10 to 300, 140

when player touches coin
  remove the coin
  add 1 to score

always
  show text "Score: {score}" at 4, 4

when score is 10
  show text "You win!"
  stop game
```

### Share it

Click **Share** on the left to get a link anyone can open to play your game. Or click **Export**, then **Game as one file** to download a single `.html` file that plays in any web browser, even offline. More in [Sharing and exporting](studio.md#sharing-and-exporting).

## What to do next

Try changing things and see what happens. Nothing you type can break your computer, and every change shows up right away.

- Make the player faster: change `move player right 2` to `move player right 4`.
- Make jumps higher: change `push player up 7` to `push player up 9`.
- Make the world bigger and add `camera follows` to the player so the screen scrolls.
- Use your own pictures instead of boxes. See [Pictures and animation](language.md#pictures-and-animation).

Where to go from here:

| Page | What's in it |
|---|---|
| [How do I...?](recipes.md) | Copy-and-paste answers: lives, enemies, timers, levels from letters, restart buttons |
| [Language guide](language.md) | Every word minijs understands, explained with examples |
| [Using Studio](studio.md) | Files, pictures, the tabs under the game, sharing, exporting, the desktop app |
| [Fixing problems](problems.md) | What each message means and how to fix it |

In Studio, the **Help** button also opens a searchable list of everything minijs understands.
