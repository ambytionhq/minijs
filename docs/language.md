# Language guide

Everything minijs understands, explained with examples. If you are brand new, start with [Getting started](getting-started.md) instead and come back here when you want to look something up.

- [How a game file is laid out](#how-a-game-file-is-laid-out)
- [Game settings](#game-settings)
- [Numbers you keep track of](#numbers-you-keep-track-of)
- [Things](#things)
- [Colors](#colors)
- [Pictures and animation](#pictures-and-animation)
- [Maps: build levels from letters](#maps-build-levels-from-letters)
- [Rules: when something happens](#rules-when-something-happens)
- [Conditions: checking if something is true](#conditions-checking-if-something-is-true)
- [Numbers and math](#numbers-and-math)
- [Actions: what to do](#actions-what-to-do)
- [Which thing does a name mean?](#which-thing-does-a-name-mean)
- [Keyboard, mouse, gamepads and touch](#keyboard-mouse-gamepads-and-touch)
- [Controls: one action, many buttons](#controls-one-action-many-buttons)
- [How a moment in the game works](#how-a-moment-in-the-game-works)
- [Limits to know about](#limits-to-know-about)

## How a game file is laid out

A game is one text file ending in `.mini`. It is made of **blocks**. A block is a line at the left edge, followed by lines pushed in underneath it.

```mini
game
  size 320 by 180

thing player
  looks like orange box 12 by 16
  starts at 40, 100

when right key is held
  move player right 2
```

The basics:

- **Indenting means "belongs to."** Lines pushed in under `thing player` describe the player. Use spaces or tabs, but not both in one file, and push in by the same amount every time.
- **One idea per line.** No commas or periods at the end.
- **Capital letters don't matter.** `When Right Key Is Held` works the same as `when right key is held`.
- **`a`, `an` and `the` are usually optional.** `remove the coin` and `remove coin` are the same.
- **Blank lines are ignored.** Use them to space things out.
- **`#` starts a note.** Everything after `#` on a line is ignored by minijs. Use notes to remind yourself what something does.

```mini
# This whole line is a note.
thing player   # a note can go at the end of a line too
  looks like orange box 12 by 16
```

The blocks you can write at the left edge:

| Block | What it's for |
|---|---|
| `game` | Settings for the whole game. At most one. |
| `score starts at 0` | A number the game keeps track of. Any name works. |
| `thing coin` | A kind of thing in the game. |
| `map` | Places lots of things at once using letters. |
| `control jump` | Groups several keys and buttons into one action. |
| `when ...` | A rule: when something happens, do something. |
| `always` | A rule that runs every moment. |

The order of blocks mostly doesn't matter, with two exceptions: things are drawn in the order you list them (later ones on top), and rules run from top to bottom.

### Names

You choose the names of things, numbers, controls and animations. A name:

- starts with a letter
- can contain letters, digits, `_` and `-`, like `big-rock` or `enemy2`
- can't be one of the words minijs already uses: `game thing control map when always key mouse gamepad any random count the not and or is to at by of on in left right up down x y vx vy width height text pressed held released`

Because `-` can be part of a name, **put spaces around math signs**. `score - 1` is "score minus one." `score-1` is a name.

## Game settings

The `game` block sets up the whole game. Every line is optional, and so is the block itself.

```mini
game
  size 320 by 180
  pixel art
  background navy
  gravity 0.4
  touch buttons
  camera stays inside 0, 0 to 960, 180
```

| Setting | What it does | If you leave it out |
|---|---|---|
| `size 320 by 180` | How many pixels wide and tall the game screen is. The game is scaled up to fit the window. | 480 by 270 |
| `pixel art` | Keeps pixels sharp and blocky when the game is scaled up. Use it with small sizes and pixel pictures. | Smooth scaling |
| `background navy` | The color behind everything. See [Colors](#colors). | Black |
| `gravity 0.4` | How hard things that `fall` are pulled down. 0.3 to 0.5 feels normal. | 0 (no gravity) |
| `touch buttons` | On phones and tablets, shows on-screen arrows plus **A** and **B** buttons. See [Touch screens](#touch-screens). | No on-screen buttons |
| `camera stays inside 0, 0 to 960, 180` | When the camera follows something, it never shows anything outside this rectangle (left, top to right, bottom). | The camera can go anywhere |

## Numbers you keep track of

Scores, lives, timers, coins collected: anything you want to count is a number with a name. Make one at the left edge:

```mini
score starts at 0
lives starts at 3
speed starts at 2.5
```

Use it anywhere a number goes: `move player right speed`, `when lives is 0`, `show text "Lives: {lives}"`. Change it with `set`, `add` and `subtract` (see [Actions](#actions-what-to-do)).

These numbers belong to the whole game, not to one thing. Every number goes back to its starting value when the game restarts.

## Things

A **thing** is anything in your game: the player, walls, coins, enemies, bullets, clouds. A `thing` block describes one *kind* of thing. There can be many copies of it in the game at once.

```mini
thing coin
  looks like gold circle 4
  starts at 100, 80
  starts at 140, 80
  starts at 180, 80
```

That makes three coins at the start.

| Line | What it does |
|---|---|
| `looks like ...` | **Required.** How it looks: a box, a circle, or a picture. Exactly one per thing. |
| `starts at 40, 100` | Puts one copy here when the game starts. Write the line again for more copies. Leave it out to start with none (you can `make` them later). |
| `size 16 by 16` | Changes how big it is. Usually you don't need this; the look sets the size. |
| `solid` | Solid things can't overlap. They stop each other and things can stand on them. |
| `fixed` | Never pushed around by anything. Use it for floors, walls and platforms. |
| `falls` | Pulled down by gravity. |
| `camera follows` | The screen scrolls to keep this thing in the middle. Only one thing can have this. |
| `animation walk "a.png", "b.png" at 8 fps` | A set of pictures to flip through. See [Pictures and animation](#pictures-and-animation). |

### Looks

```mini
thing wall
  looks like gray box 16 by 16      # a rectangle, width by height

thing ball
  looks like red circle 6            # a circle with a radius of 6, so 12 across

thing hero
  looks like "hero.png"              # a picture, in quotes
```

### Positions

Positions are two numbers: how far **right** from the left edge, then how far **down** from the top. `0, 0` is the top-left corner. The position is where the thing's top-left corner goes.

Negative numbers are fine, for example `starts at -100, 160` to start something off the left of the screen.

### Solid, fixed and falls together

These three words are how you get platformer physics:

| Kind of thing | Lines to use |
|---|---|
| Player in a platformer | `solid` and `falls` |
| Floor, wall, platform | `solid` and `fixed` |
| Crate you can push | `solid` and `falls` |
| Coin, enemy you walk through, decoration | Nothing. It doesn't block anything. |
| Player in a top-down game | `solid` (no gravity, so no `falls`) |

`touches` rules work whether or not things are solid.

> **Note:** every shape bumps into things as a rectangle, even circles. A circle with radius 4 is treated as an 8 by 8 square.

## Colors

Write any web color name. Multi-word names can have spaces:

```mini
game
  background sky blue

thing player
  looks like dark orange box 12 by 16
```

Some favorites: `red`, `orange`, `gold`, `yellow`, `lime`, `green`, `sea green`, `teal`, `sky blue`, `blue`, `navy`, `purple`, `hot pink`, `brown`, `tan`, `white`, `light gray`, `gray`, `dark slate gray`, `black`. All [148 web color names](https://developer.mozilla.org/en-US/docs/Web/CSS/named-color) work.

For an exact color, use a hex code with 3 or 6 digits: `#ff8800` or `#f80`.

If you misspell a color, minijs suggests the closest one.

## Pictures and animation

### Using a picture

1. Put the picture in your project. In Studio, drag it from your computer onto the **Files** list, or click the **Add files** button above it.
2. Use its file name in quotes:

```mini
thing hero
  looks like "hero.png"
```

minijs looks for the picture next to your `.mini` file first, then in a folder called `assets` next to it. So `"hero.png"` finds both `hero.png` and `assets/hero.png`. You can also write a path like `"enemies/bat.png"`.

PNG, JPG, GIF, WebP, SVG, AVIF and BMP all work. PNG is best for pixel art. The thing's size is the picture's size unless you add a `size` line.

If a picture can't be found, minijs draws a bright pink square in its place and tells you about it in the **Problems** tab. The game keeps running.

> **Tip:** for crisp pixel art, add `pixel art` to the `game` block and draw your pictures at the real game size (for example 16 by 16), not scaled up.

### Animation

An animation is a list of pictures shown one after another, over and over:

```mini
thing hero
  looks like "hero-idle.png"
  animation walk "hero-1.png", "hero-2.png", "hero-3.png" at 8 fps

when right key is held
  move hero right 2
  play walk on hero

when right key is released
  stop animation on hero
```

- `animation walk ...` names the animation (`walk`) and lists its pictures. `at 8 fps` means 8 pictures per second.
- `play walk on hero` starts it. If it is already playing, it keeps going smoothly instead of starting over, so it's fine to put it in a `held` rule.
- `stop animation on hero` goes back to the normal look.

A thing can have as many animations as you like. To show an animation all the time (a flickering torch, a spinning coin), play it when the game starts:

```mini
thing torch
  looks like "torch-1.png"
  animation flicker "torch-1.png", "torch-2.png" at 6 fps
  starts at 50, 40

when game starts
  play flicker on torch
```

## Maps: build levels from letters

Placing walls one `starts at` line at a time gets slow. A `map` lets you draw a level with letters instead. Each letter is one tile:

```mini
thing wall
  looks like gray box 16 by 16
  solid
  fixed

thing coin
  looks like gold circle 4

map
  "##########"
  "#........#"
  "#..c..c..#"
  "#........#"
  "##########"
  "#" is wall
  "c" is coin
```

- Each row goes in quotes, top to bottom.
- Under the rows, say what each letter means: `"#" is wall`.
- `.` and spaces always mean an empty tile.
- Each letter must be one character, and can only mean one thing.

Tiles are 16 by 16 pixels and the map starts at the top-left corner, unless you change it:

```mini
map
  tiles 8 by 8
  at 0, 100
  "########"
  "#" is wall
```

| Line | What it does | Default |
|---|---|---|
| `tiles 8 by 8` | The width and height of one tile | 16 by 16 |
| `at 0, 100` | Where the top-left tile goes | 0, 0 |

Map tiles are ordinary things. Rules like `when player touches coin` work on them exactly as if you had written `starts at` lines. You can have more than one `map`, for example one for walls and another, shifted a little, for spikes.

## Rules: when something happens

A rule says: **when** this happens, do these actions.

```mini
when player touches coin
  remove the coin
  add 1 to score
```

Every rule needs at least one indented action under it.

### Everything a rule can wait for

| Rule | When it happens |
|---|---|
| `when game starts` | Once, at the very start (and again after a restart) |
| `always` | Every moment, 60 times a second |
| `when space key is pressed` | Once, the moment the key goes down |
| `when space key is held` | Every moment the key is down |
| `when space key is released` | Once, the moment the key comes up |
| `when any key is pressed` | Any key at all. Also `held` and `released`. |
| `when mouse is clicked` | The moment the left mouse button goes down. `clicked` and `pressed` mean the same. |
| `when right mouse is clicked` | Also `left mouse` and `middle mouse`. Also `held` and `released`. |
| `when mouse is clicked on button` | Clicked while the pointer is over a thing called `button` |
| `when gamepad a is pressed` | A button on gamepad 1. Also `held` and `released`. |
| `when gamepad 2 start is pressed` | A button on gamepad 2 (up to 4) |
| `when jump is pressed` | A [control](#controls-one-action-many-buttons) you made. Also `held` and `released`. |
| `when player touches coin` | Every moment the two overlap, once for each pair. Edges touching counts. |
| `when rock leaves the screen` | Once, when a rock goes completely off the screen |
| `when every 2 seconds` | Repeats. The first time is after 2 seconds. |
| `when after 5 seconds` | Once, 5 seconds after the start |
| `when score is 10` | Once, the moment this becomes true. See below. |

**Pressed, held or released?** Use `pressed` for things that should happen once per tap, like jumping or shooting. Use `held` for things that should keep happening, like walking.

### Adding a condition

Add `and` plus a condition to any rule to make it only happen sometimes:

```mini
when up key is pressed and player is on ground
  push player up 7

when space key is pressed and ammo is above 0
  make a bullet at player x, player y
  subtract 1 from ammo
```

### Rules that wait for something to become true

If the part after `when` isn't one of the events above, it's a condition, and the rule happens **once each time the condition becomes true**:

```mini
when score is 10
  show text "Halfway there!"

when lives is 0
  show text "Game over"
  stop game
```

`when score is 10` runs once when the score reaches 10. It won't run again unless the score changes to something else and then comes back to 10. That's usually what you want: one "game over" message, not sixty a second.

### Two keys for the same thing

You can't write `when a key is pressed or b key is pressed`. Instead make a [control](#controls-one-action-many-buttons) that lists both keys. To require two keys at once, use a condition:

```mini
when s key is pressed and ctrl key is held
  log "Saved!"
```

## Conditions: checking if something is true

Conditions are used after `when`, and after `and` in a rule.

| Condition | True when |
|---|---|
| `score is 10` | The two numbers are equal |
| `lives is not 0` | They are different |
| `player x is above 100` | The first is bigger. Also `is more than`, `is greater than`, `is bigger than`. |
| `score is below 3` | The first is smaller. Also `is less than`, `is smaller than`. |
| `player is on ground` | The thing is standing on something solid. Also `is on the ground`. |
| `left key is held` | That key is down right now |
| `mouse is held` | The left mouse button is down. Also `right mouse is held`. |
| `mouse is over button` | The pointer is over a thing called `button` |
| `gamepad a is held` | That gamepad button is down |
| `jump is held` | Any input in the `jump` control is down |

Combine them:

| Word | Meaning | Example |
|---|---|---|
| `and` | Both must be true | `player is on ground and lives is above 0` |
| `or` | At least one must be true | `score is 10 or time is 60` |
| `not` | Flips it | `not player is on ground` |

When you mix them, `not` is worked out first, then `and`, then `or`. There are no brackets, so if a condition gets confusing, split it into two rules.

> **Note:** "above" and "below" compare numbers. They don't mean "higher on the screen." Because y grows downward, a thing higher on the screen has a *smaller* y. So "the player is higher than 50" is `player y is below 50`.

## Numbers and math

Anywhere minijs wants a number, you can write any of these:

| Write | Means |
|---|---|
| `12`, `3.5`, `-4` | A plain number. Write `0.5`, not `.5`. |
| `score` | A number you made with `starts at` |
| `player x`, `player y` | Where a thing is (its top-left corner) |
| `player vx`, `player vy` | How fast it's moving right (vx) and down (vy), in pixels per moment |
| `player width`, `player height` | Its size |
| `count of coin` | How many coins exist right now |
| `mouse x`, `mouse y` | Where the pointer is in the game world |
| `gamepad stick x` | Left stick on gamepad 1, from -1 (left) to 1 (right). Also `stick y`, `right stick x`, `gamepad 2 stick x`. |
| `random 1 to 6` | A random whole number, including both ends. Different every time. |

Math works with `+`, `-`, `*` (times) and `/` (divided by). **Always put spaces around them.**

```mini
when space key is pressed
  move player right speed * 2
  set player x to player x + 10
  make a coin at random 0 to 300, player y - 20
```

`*` and `/` are worked out before `+` and `-`, like at school. Dividing by zero gives 0 and a warning in the **Problems** tab instead of crashing.

If the thing you ask about doesn't exist (for example `enemy x` when there are no enemies), the answer is 0.

## Actions: what to do

Actions go on the indented lines under a rule.

### Moving things

| Action | What it does |
|---|---|
| `move player right 2` | Moves it 2 pixels right, right now. Solid things block it. Directions: `left`, `right`, `up`, `down`. |
| `push player up 7` | Adds speed in a direction. The thing keeps moving on its own after that. |
| `stop player` | Takes away all its speed |
| `set player x to 40` | Puts it somewhere exact. Also `y`. Great for teleporting. |
| `set player vx to 3` | Sets its speed exactly. Also `vy`. |

**`move` or `push`?** `move` is like walking: it happens only while your rule keeps running, so put it in a `held` rule. `push` is like a kick: the thing keeps going until something stops it. Jumps are pushes. Gravity slows down upward pushes; nothing slows down sideways pushes, so stop them yourself with `stop` or `set ... vx to 0`.

### Numbers

| Action | What it does |
|---|---|
| `set score to 0` | Changes a number |
| `add 1 to score` | Makes it bigger |
| `subtract 1 from lives` | Makes it smaller |

Any of these can use math: `add count of coin * 10 to score`.

### Making and removing things

| Action | What it does |
|---|---|
| `make a coin at 100, 40` | Creates a new coin at that position |
| `remove the coin` | Removes it. In a `touches` rule, just the one that was touched. Elsewhere, every coin. |

New things appear and removed things disappear at the end of the current moment, after all the rules have run.

### Looks

| Action | What it does |
|---|---|
| `change player to look like red box 12 by 16` | A new look. Also a picture: `change player to look like "hurt.png"`. |
| `play walk on player` | Starts the animation called `walk` |
| `stop animation on player` | Goes back to its normal look |

### Text

| Action | What it does |
|---|---|
| `show text "You win!"` | Words in the middle of the screen |
| `show text "Score: {score}" at 4, 4` | Words at a position on the screen |
| `show text "Hurry!" at 4, 16 in red` | Words in a color (white if you don't say) |
| `log "score is {score}"` | Writes a line in Studio's **Messages** tab. Players never see it. Handy for finding out what your game is doing. |

Put a number name, or any math, in `{curly brackets}` inside the text to show its value: `"Coins left: {count of coin}"`. Whole numbers show without decimals; others show up to two decimals.

Text positions are on the **screen**, not in the world, so a score stays in the corner even when the camera scrolls.

Each `show text` line in your file owns its own text on the screen. Running that line again replaces what it shows, which is how a score stays up to date. Text stays on screen until the game restarts, and two different `show text` lines at the same position will draw on top of each other.

### The whole game

| Action | What it does |
|---|---|
| `stop game` | Freezes everything. The last picture stays on screen. |
| `restart game` | Starts over from the beginning: every thing and number back to how it started |

> **Heads up:** after `stop game`, no rules run at all, including key presses, so a "press R to restart" rule won't work. The player can use the **Restart** button in Studio. For a restart key in a finished game, see [Game over with a restart key](recipes.md#game-over-with-a-restart-key).

## Which thing does a name mean?

There can be many coins at once, so what does `coin` mean in a rule?

**In rules about one specific thing**, the name means *that one*:

- `when player touches coin`: `coin` is the coin being touched, and `player` is that player.
- `when mouse is clicked on button`: `button` is the one that was clicked.
- `when rock leaves the screen`: `rock` is the rock that left.

```mini
when bullet touches enemy
  remove the enemy     # only the enemy that was hit
  remove the bullet    # only the bullet that hit it
```

**Everywhere else**, a name means *every one of them*:

```mini
when space key is pressed
  remove coin          # removes ALL coins
  move enemy left 1    # moves ALL enemies
```

When you ask for a number like `enemy x` and there are many enemies, you get the first enemy's value. If there are none, you get 0.

## Keyboard, mouse, gamepads and touch

### Keys

| Write | Key |
|---|---|
| `left`, `right`, `up`, `down` | Arrow keys |
| `space`, `enter`, `shift`, `escape`, `tab`, `backspace`, `delete`, `ctrl`, `alt` | Those keys |
| `a` to `z` | Letter keys |
| `0` to `9` | Number keys (the number pad counts too) |
| `any` | Any key at all |

Always follow the key with the word `key`: `when w key is held`, `when 1 key is pressed`.

### Mouse

`mouse` means the left button. You can also write `left mouse`, `right mouse` or `middle mouse`.

```mini
when mouse is clicked on target
  remove the target
  add 1 to score

when right mouse is held
  move player up 1
```

`mouse x` and `mouse y` tell you where the pointer is, and `mouse is over target` checks if it's on a thing. On phones and tablets, a tap counts as a left click.

### Gamepads

Plug in a gamepad (or connect one by Bluetooth) and press any button so the browser notices it.

| Write | Button |
|---|---|
| `a`, `b`, `x`, `y` | The four face buttons |
| `lb`, `rb` | Shoulder buttons |
| `lt`, `rt` | Triggers. They count as pressed when squeezed more than halfway. |
| `select`, `start` | The middle buttons |
| `ls`, `rs` | Pressing a stick in |
| `up`, `down`, `left`, `right` | The d-pad |

`gamepad a` means gamepad 1. For other players write `gamepad 2 a`, up to `gamepad 4`. Gamepads are numbered in the order they were connected.

The sticks are numbers from -1 to 1, and 0 when resting:

```mini
always
  move player right gamepad stick x * 3
  move player down gamepad stick y * 3
```

(Moving right by a negative number moves left, so this one rule handles every direction.)

### Touch screens

Add `touch buttons` to the `game` block. On phones and tablets, the game shows four arrows and two buttons:

| On-screen button | Acts like |
|---|---|
| Arrows | The arrow keys |
| **A** | `space` |
| **B** | `enter` |

So if your game uses arrows, space and enter, it works on phones with no extra rules. Buttons don't show on computers with a mouse.

## Controls: one action, many buttons

Want jump to work with the up arrow, space, *and* a gamepad? Make a `control`:

```mini
control jump
  up key
  space key
  gamepad a

when jump is pressed and player is on ground
  push player up 7
```

List any keys, mouse buttons (`right mouse`) and gamepad buttons (`gamepad 2 a`) under it, one per line. Then use the control's name like a key: `when jump is pressed`, `when jump is held`, or the condition `jump is held`.

Pressing two of its keys at once still counts as one press. The **Controls** tab in Studio shows each control lighting up as you press things.

## How a moment in the game works

You don't need this to make games, but it helps when something behaves unexpectedly.

The game runs 60 moments ("ticks") per second, always, no matter how fast the screen is. Each moment:

1. Read the keyboard, mouse, gamepads and touch screen.
2. Run the rules about the game starting, timers, keys, mouse, gamepads, controls, conditions and `always`, from top to bottom.
3. Move everything: apply gravity, speed and `move`s, and stop solid things from overlapping.
4. Run the `touches` and `leaves the screen` rules, from top to bottom.
5. Remove things that were removed, then add things that were made.
6. Flip animation pictures.

Then the screen is drawn. Things are drawn in the order their `thing` blocks appear in your file, so list backgrounds first and the player near the end. Text is drawn on top of everything.

Speeds and distances are in pixels per moment. `move player right 2` is 120 pixels per second. `gravity 0.4` adds 0.4 to a falling thing's downward speed every moment.

## Limits to know about

- **No sound yet.**
- **Numbers belong to the whole game,** not to one thing. Every enemy can't have its own health. (Tip: use different kinds of things, like `enemy` and `hurt-enemy`.)
- **Shapes are rectangles for bumping.** Circles and see-through parts of pictures still count as their full rectangle.
- **Things don't turn or grow.** No rotation or scaling. Use a different picture instead.
- **No waiting inside a rule.** Use `when after 3 seconds` or `when every 3 seconds` instead.
- **One text size.** Text is always the same small font.
- **`stop game` stops all rules,** including keys. See [the recipe](recipes.md#game-over-with-a-restart-key) for a restart key.
- **Moving platforms don't carry riders.** A `fixed` platform you `move` slides out from under the player.
- **`when coin touches coin`** only knows about one of the two coins.
- **At most 10,000 things at once.** More than that stops the game with a message.
- **The camera** keeps the followed thing centered and can show empty space past the edge of your level, unless you add `camera stays inside` to the `game` block.
