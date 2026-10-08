# How do I...?

Short, copy-and-paste answers to common questions. Each one is a working piece of a game: paste it into your file and change the names, numbers and colors to fit.

If a recipe uses a thing (like `player`) that your game calls something else, change the name everywhere in the recipe.

**Moving**
- [Walk with the arrow keys](#walk-with-the-arrow-keys)
- [Walk with arrows, WASD and a gamepad](#walk-with-arrows-wasd-and-a-gamepad)
- [Jump](#jump)
- [Make the screen scroll with the player](#make-the-screen-scroll-with-the-player)
- [Keep the player on the screen](#keep-the-player-on-the-screen)
- [Make a walk animation](#make-a-walk-animation)

**Scoring and winning**
- [Keep score](#keep-score)
- [Lives](#lives)
- [A countdown timer](#a-countdown-timer)
- [Win when everything is collected](#win-when-everything-is-collected)
- [Game over with a restart key](#game-over-with-a-restart-key)
- [A title screen](#a-title-screen)

**Enemies and hazards**
- [An enemy that walks back and forth](#an-enemy-that-walks-back-and-forth)
- [Things that fall from the sky](#things-that-fall-from-the-sky)
- [Shoot](#shoot)
- [Spikes that send you back to the start](#spikes-that-send-you-back-to-the-start)

**Building levels**
- [Draw a level with letters](#draw-a-level-with-letters)
- [A door that needs a key](#a-door-that-needs-a-key)

**Mouse and phones**
- [Click on things](#click-on-things)
- [A button that buys something](#a-button-that-buys-something)
- [Make it work on phones](#make-it-work-on-phones)

**Finding problems**
- [See what my game is doing](#see-what-my-game-is-doing)

---

## Walk with the arrow keys

Top-down (moving in all four directions, no gravity):

```mini
when left key is held
  move player left 2
when right key is held
  move player right 2
when up key is held
  move player up 2
when down key is held
  move player down 2
```

For a side-on platformer, leave out `up` and `down` and use [Jump](#jump) instead.

## Walk with arrows, WASD and a gamepad

Make a [control](language.md#controls-one-action-many-buttons) for each direction, then use the control in your rules:

```mini
control go-left
  left key
  a key
  gamepad left

control go-right
  right key
  d key
  gamepad right

when go-left is held
  move player left 2
when go-right is held
  move player right 2

# The gamepad's stick, too:
always
  move player right gamepad stick x * 2
```

## Jump

The player needs `falls` and `solid`, the floor needs `solid` and `fixed`, and the game needs gravity:

```mini
game
  gravity 0.4

thing player
  looks like orange box 12 by 16
  starts at 40, 100
  solid
  falls

thing floor
  looks like sea green box 480 by 20
  starts at 0, 250
  solid
  fixed

when up key is pressed and player is on ground
  push player up 7
```

Change `7` for higher or lower jumps. Change the gravity for floatier (smaller number) or heavier (bigger number) jumps.

## Make the screen scroll with the player

Add `camera follows` to the player:

```mini
thing player
  looks like orange box 12 by 16
  starts at 40, 100
  camera follows
```

To stop the camera from showing empty space past the edges of your level, tell it the size of the level in the `game` block (left, top to right, bottom):

```mini
game
  size 320 by 180
  camera stays inside 0, 0 to 1200, 180
```

## Keep the player on the screen

Surround the play area with solid walls the player can't pass. For a 320 by 180 game:

```mini
thing edge
  looks like black box 4 by 180
  solid
  fixed
  starts at -4, 0
  starts at 320, 0

thing player
  looks like orange box 12 by 16
  starts at 40, 100
  solid
```

The walls sit just outside the screen, so players never see them.

## Make a walk animation

```mini
thing hero
  looks like "hero-idle.png"
  animation walk "hero-1.png", "hero-2.png", "hero-3.png" at 8 fps
  starts at 40, 100

when right key is held
  move hero right 2
  play walk on hero
when left key is held
  move hero left 2
  play walk on hero

when right key is released
  stop animation on hero
when left key is released
  stop animation on hero
```

## Keep score

```mini
score starts at 0

when player touches coin
  remove the coin
  add 1 to score

always
  show text "Score: {score}" at 4, 4
```

## Lives

Lose a life when an enemy touches you, and send the player back to the start:

```mini
lives starts at 3

when player touches enemy
  subtract 1 from lives
  set player x to 40
  set player y to 100

always
  show text "Lives: {lives}" at 4, 16

when lives is 0
  show text "Game over"
  stop game
```

Moving the player away right after a hit stops the enemy from taking all three lives in three moments.

## A countdown timer

```mini
time-left starts at 30

when every 1 second
  subtract 1 from time-left

always
  show text "Time: {time-left}" at 260, 4

when time-left is 0
  show text "Time's up!"
  stop game
```

## Win when everything is collected

Use `count of` to check how many are left:

```mini
thing gem
  looks like aqua circle 4
  starts at 60, 80
  starts at 120, 60
  starts at 200, 90

when player touches gem
  remove the gem

when count of gem is 0
  show text "You found them all!"
  stop game
```

## Game over with a restart key

`stop game` stops *every* rule, including key presses, so a restart key can't work after it. Instead, keep a number that says whether the game is still being played, and check it in your rules:

```mini
playing starts at 1
lives starts at 3

when right key is held and playing is 1
  move player right 2
when left key is held and playing is 1
  move player left 2

when player touches enemy and playing is 1
  subtract 1 from lives
  set player x to 40

when lives is 0
  set playing to 0
  show text "Game over! Press R to play again."

when r key is pressed
  restart game
```

`restart game` puts every thing and number back how they started, including `playing`.

## A title screen

Show a title thing (or text) that disappears when the player presses anything:

```mini
thing title
  looks like "title.png"
  starts at 80, 40

when any key is pressed
  remove title
when mouse is clicked
  remove title
```

Put the `title` thing's block **last** in your file so it is drawn on top of everything. No picture yet? A plain box works too: `looks like black box 320 by 180` covers a 320 by 180 screen. (Use a picture or box rather than `show text` for titles, because text can't be removed once it is shown.)

To also pause the game until the title is gone, use a `playing` number as in [Game over with a restart key](#game-over-with-a-restart-key), starting at `0`, and set it to `1` when a key is pressed.

## An enemy that walks back and forth

Use a number for its speed and flip it every few seconds:

```mini
patrol starts at 1

thing enemy
  looks like crimson box 12 by 12
  starts at 100, 148

always
  move enemy right patrol

when every 2 seconds
  set patrol to 0 - patrol
```

Moving right by a negative number moves left, so `0 - patrol` turns it around. Every enemy shares the same `patrol` number, so they all turn together.

## Things that fall from the sky

```mini
thing rock
  looks like gray box 10 by 10

when every 1 second
  make a rock at random 0 to 310, -10

always
  move rock down 2

when rock leaves the screen
  remove the rock

when player touches rock
  show text "Ouch! Game over"
  stop game
```

Removing rocks that leave the screen keeps the game fast.

## Shoot

```mini
thing bullet
  looks like yellow box 2 by 6

thing enemy
  looks like purple box 12 by 12
  starts at 150, 20
  starts at 200, 20

when space key is pressed
  make a bullet at player x + 5, player y

always
  move bullet up 4

when bullet leaves the screen
  remove the bullet

when bullet touches enemy
  remove the bullet
  remove the enemy
  add 1 to score
```

`player x + 5` starts the bullet near the middle of the player instead of its left edge.

## Spikes that send you back to the start

```mini
thing spikes
  looks like silver box 16 by 8
  starts at 120, 152

when player touches spikes
  set player x to 40
  set player y to 100
  stop player
```

`stop player` takes away its speed, so it doesn't keep falling fast after being moved back.

## Draw a level with letters

A [map](language.md#maps-build-levels-from-letters) places a thing for every letter. Each letter is a 16 by 16 tile:

```mini
thing wall
  looks like slate gray box 16 by 16
  solid
  fixed

thing coin
  looks like gold circle 4

thing spikes
  looks like silver box 16 by 8

map
  "...................."
  "...........c........"
  "........#####......."
  "...c................"
  "..####.......c..^^.."
  "####################"
  "#" is wall
  "c" is coin
  "^" is spikes
```

Change a letter, and the level changes. Use `.` for empty space so it's easy to count tiles.

## A door that needs a key

```mini
keys starts at 0

thing old-key
  looks like gold box 8 by 4
  starts at 60, 150

thing door
  looks like brown box 8 by 32
  starts at 200, 128
  solid
  fixed

when player touches old-key
  remove the old-key
  add 1 to keys

when player touches door and keys is above 0
  remove the door
  subtract 1 from keys
```

(The thing is called `old-key` because `key` is a word minijs already uses.)

## Click on things

```mini
thing target
  looks like red circle 8

when every 1 second
  make a target at random 10 to 300, random 10 to 160

when mouse is clicked on target
  remove the target
  add 1 to score
```

## A button that buys something

```mini
coins starts at 0
helpers starts at 0

thing buy-button
  looks like green box 80 by 20
  starts at 230, 150

when mouse is clicked
  add 1 to coins

when mouse is clicked on buy-button and coins is above 9
  subtract 10 from coins
  add 1 to helpers

when every 1 second
  add helpers to coins

always
  show text "Coins: {coins}  Helpers: {helpers}" at 4, 4
  show text "Buy (10)" at 238, 156 in black
```

## Make it work on phones

Add `touch buttons` to the `game` block:

```mini
game
  touch buttons
```

Phones and tablets show arrows (which act like the arrow keys), an **A** button (acts like `space`) and a **B** button (acts like `enter`). If your game is played with arrows and space, you don't need to change anything else. Taps also count as mouse clicks.

## See what my game is doing

Use `log` to write messages to the **Messages** tab under the game. Players never see them.

```mini
when player touches coin
  log "got a coin, score is now {score}"
```

The **Game values** tab shows every number in your game and how many of each thing exist, live as you play. The **Controls** tab shows which keys and buttons the game thinks are pressed. More in [Using Studio](studio.md#the-tabs-under-the-game).
