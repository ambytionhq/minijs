# Fixing problems

When minijs doesn't understand something, it tells you in the **Problems** tab under the game: which line, what's wrong, and usually how to fix it. Click a problem to jump straight to that line.

This page explains the messages you're most likely to see, and what to do when your game runs but doesn't do what you expect.

- [First steps](#first-steps)
- [Common messages](#common-messages)
- [My game runs, but...](#my-game-runs-but)
- [Studio questions](#studio-questions)

## First steps

1. **Fix the first problem first.** One mistake can confuse minijs about the lines after it. Fixing the top one often makes the others disappear.
2. **Read the hint.** Most messages end with a suggestion, like *Did you mean "coin"?*. It's usually right.
3. **Check the line above too.** A missing word or wrong indent on one line can show up as a problem on the next.
4. **Compare with an example.** The [language guide](language.md) and [recipes](recipes.md) have a working example of almost everything.

The game doesn't start while the file has problems, so the last working version keeps playing until you fix them.

## Common messages

### Spelling and names

**I don't know what "cion" is. Did you mean "coin"?**
A thing or number name is misspelled, or it was never made. Fix the spelling, or add the missing block: a `thing cion` block for a thing, or `cion starts at 0` for a number.

**I don't know what "jump" is. Make it first with a line like: jump starts at 0**
You used a number before creating it. Add the `starts at` line at the left edge of the file.

**I don't know the control "jump".**
You wrote `when jump is pressed`, but there's no `control jump` block. Make one ([how](language.md#controls-one-action-many-buttons)), or if you meant a key, write `when space key is pressed`.

**"key" is a special word in minijs, so it can't be a name.**
Some words, like `key`, `when`, `text` and `game`, already mean something. The full list is in [Names](language.md#names). Pick another name, like `old-key` or `door-key`.

**There are two things called "coin".**
Each `thing` block needs its own name. To have many coins, use one `thing coin` block with several `starts at` lines.

**"score" is used as both a thing and a number.**
A name can only mean one thing. Rename one of them, like `score` and `score-sign`.

**"player" is a thing, not a number. Did you mean "player x"?**
You used a thing where a number goes. Things aren't numbers, but their position is: `player x`, `player y`, or `count of player`.

### Writing lines

**I don't know what "jumpp" means here.**
minijs didn't recognize the first word of the line. Check the spelling. At the left edge, lines start with `game`, `thing`, `control`, `map`, `when`, `always`, or a name followed by `starts at`.

**I don't know how to "jump".**
Actions start with one of these words: `move`, `push`, `stop`, `set`, `add`, `subtract`, `make`, `remove`, `change`, `play`, `show`, `log`, `restart`. To jump, write `push player up 7`.

**I expected a number here, but found ...**
Something is missing or in the wrong order. Look at the hint and compare the line with an example. Common causes: `starts at 40 100` (missing comma, write `40, 100`), or `size 16x16` (write `16 by 16`).

**I expected a number but found "10px".**
Write just the number: `10`.

**This text is missing its closing quote (").**
Every piece of text in quotes needs a `"` at both ends: `show text "Hello"`.

**I expected some actions under this line.**
Every `when` and `always` needs at least one indented action under it.

**"or" can't join two events, like two key presses.**
`when a key is pressed or b key is pressed` doesn't work. Make a [control](language.md#controls-one-action-many-buttons) with both keys and use `when my-control is pressed`.

**Inside a condition, only "is held" works for keys.**
After `and`, a key can only be checked as `held`: `when space key is pressed and shift key is held`. "Pressed" only works right after `when`.

### Indenting

Indenting (pushing a line in with spaces) shows what belongs to what.

**This line is indented more than I expected.**
Only lines that belong to the line above should be pushed in. Check that this line isn't pushed in further than its neighbors.

**This line is indented by an odd amount.**
Every level must be pushed in by the same amount. If the first indented line used 2 spaces, use 2, 4, 6 and so on.

**This line mixes tabs and spaces at the start.**
Use only spaces or only tabs in one file. Delete the space at the start of the line and type it again.

### Things and looks

**The thing "coin" needs a look.**
Every thing needs a `looks like` line, like `looks like gold circle 4`.

**The thing "player" has more than one "looks like" line.**
Keep one. To change its look during the game, use `change player to look like ...` in a rule.

**I don't know the color "skyblu".**
Check the spelling. Use a web color name like `sky blue` or a hex code like `#87ceeb`. See [Colors](language.md#colors).

**Only one thing can have "camera follows".**
The camera can only follow one thing. Remove the extra `camera follows` lines.

**"hero" has no animation called "run".**
The animation's name in `play run on hero` must match an `animation run ...` line inside `thing hero`.

### Maps

**I don't know what "x" means in this map.**
Add a line under the rows saying what `x` is, like `"x" is wall`. Use `.` for empty tiles.

**A map letter must be exactly one character.**
Write `"#" is wall`, not `"##" is wall`.

### While the game is running

**I couldn't load the picture "hero.png".**
The game shows a pink square instead. Check the spelling, including capital letters and the ending (`.png`, `.jpg`), and that the picture is in your project, next to the game file or in an `assets` folder. In Studio, click the picture in the Files list to see the exact line to use.

**There are too many things in the game at once, so I stopped it.**
Over 10,000 things exist at once. Usually something is being made every moment without being removed. Remove things that leave the screen (`when rock leaves the screen` → `remove the rock`), and check that `make` isn't inside an `always` or `held` rule by accident.

**Something got divided by zero here.**
Something was divided by 0. minijs uses 0 as the answer and keeps going. Check the number after the `/`.

## My game runs, but...

**Nothing happens when I press keys.**
Click on the game first. It only listens to the keyboard while it's selected.

**My player falls through the floor.**
Both need `solid`. The floor also needs `fixed`, or the player will push it down.

**My player falls off the bottom of the screen and doesn't land.**
There's no floor under it, or the floor is in the wrong place. Remember y counts **down** from the top: a floor at the bottom of a 180-tall game should start near `y = 160`.

**My player doesn't fall at all.**
Add `falls` to the player and `gravity 0.4` to the `game` block. Both are needed.

**The jump doesn't work.**
Check that the jump rule says `pressed` (not `held`), that the player is `solid` and the floor is `solid`, and that the condition is `player is on ground`.

**My player can jump in the air forever.**
Add `and player is on ground` to the jump rule.

**My player keeps sliding after I let go.**
You used `push` for walking. `push` keeps going; `move` only happens while the key is held. Use `move player right 2` in a `held` rule.

**My "you win" rule never happens.**
Open the **Game values** tab and watch the number while you play. Maybe it skips past the number you're checking (for example `add 2 to score` never lands on 15). Use `is above` instead of `is` to be safe: `when score is above 14`.

**A rule happens over and over when I want it once.**
`held`, `always` and `touches` happen every moment. Use `pressed` for keys. For touches, remove one of the two things, move it away, or use a number to remember it already happened.

**My rule only happens once when I want it to keep happening.**
A rule like `when score is 10` only runs at the moment it becomes true. For keys, use `held`. For something ongoing, put the action in an `always` rule.

**`remove coin` removed every coin.**
Outside a `touches` or `clicked on` rule, a name means every one of them. Inside `when player touches coin`, `remove the coin` removes just the touched one. See [Which thing does a name mean?](language.md#which-thing-does-a-name-mean)

**My score text overlaps itself or never goes away.**
Text stays until the game restarts. Show changing values from one `show text` line in an `always` rule, so it replaces itself, rather than from several different rules.

**My restart key doesn't work after game over.**
`stop game` stops every rule, including keys. Use the [restart key recipe](recipes.md#game-over-with-a-restart-key) instead.

**Something is drawn behind something else.**
Things are drawn in the order their `thing` blocks appear in your file. Move the block of the thing that should be on top further down.

**My picture looks blurry.**
Add `pixel art` to the `game` block.

**My gamepad doesn't work.**
Press any button on it after the game has started, so the browser notices it. Check the **Controls** tab to see what the game sees.

## Studio questions

**Where did my projects go?**
In the browser, projects live in that one browser on that one computer. A different browser, a private window, or clearing site data won't have them. Keep backups with **Download zip** from the project's **⋯** menu.

**How do I move a project to another computer?**
**Export → Whole project** downloads a `.zip`. On the other computer, use **Add existing → Import a game**.

**Can I use minijs offline?**
Yes, after you've opened Studio once with internet. See [Working offline](studio.md#working-offline).

**My computer says the desktop app or an exported game can't be opened.**
It isn't signed by Apple or Microsoft yet. On a Mac, right-click it and choose **Open**. On Windows, click **More info**, then **Run anyway**.

**Something still isn't right.**
[Open an issue on GitHub](https://github.com/ambytionhq/minijs/issues) and paste your game file. Say what you expected to happen and what happened instead.
