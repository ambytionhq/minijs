# minijs documentation

minijs lets you make 2D games by writing plain sentences. No coding experience needed.

## Start here

**[Getting started](getting-started.md)**: open Studio and build your first game in about 15 minutes, one step at a time.

## Guides

| Page | Read it when you want to... |
|---|---|
| [Getting started](getting-started.md) | Make your first game |
| [How do I...?](recipes.md) | Copy a ready-made answer: jumping, lives, enemies, shooting, timers, levels, restart keys |
| [Language guide](language.md) | Look up any word or rule minijs understands |
| [Using Studio](studio.md) | Learn the editor: files, pictures, sharing, exporting, the desktop app, offline use |
| [Tile maps](tilemaps.md) | Paint levels with tiles, draw your own tiles, use autotile and layers |
| [Particles](particles.md) | Add sparkles, smoke, fire, explosions, rain and snow |
| [Sound and music](sound.md) | Add sound effects and looping music, with no recordings needed |
| [States](state-machines.md) | Make things act differently at different times, or add a menu and game over |
| [Fixing problems](problems.md) | Understand a message, or figure out why your game isn't doing what you expect |

## Cheat sheet

```mini
game                                  # settings for the whole game
  size 320 by 180
  background sky blue
  gravity 0.4

score starts at 0                     # a number to keep track of

thing player                          # a kind of thing
  looks like orange box 12 by 16      # or: gold circle 4, or "hero.png"
  starts at 40, 100                   # where one copy appears
  solid                               # can't overlap other solid things
  falls                               # pulled down by gravity

thing ground
  looks like sea green box 320 by 20
  starts at 0, 160
  solid
  fixed                               # never pushed around

thing coin
  looks like gold circle 4
  starts at 120, 140

when right key is held                # a rule
  move player right 2                 # an action

when up key is pressed and player is on ground
  push player up 7

when player touches coin
  remove the coin
  add 1 to score

always                                # every moment
  show text "Score: {score}" at 4, 4
```

The extras add a line or two each:

```mini
tilemap cave "cave.tilemap"           # a level you painted in Studio
sound ding like coin                  # a ready-made sound
particles shine like sparkle          # a ready-made effect
music theme "theme.music"             # a tune you made in Studio

thing player
  looks like orange box 12 by 16
thing coin
  looks like gold circle 4

when player touches coin
  remove the coin
  play sound ding
  burst shine on the coin

when game starts
  play music theme

states player                         # what it's doing right now
  state walk
    go to rest after 2 seconds
  state rest
    go to walk after 1 second
```

In Studio, the **Help** button opens a searchable version of the [language guide](language.md).

## For developers

Building minijs itself, embedding the engine in a web page, or releasing a new version? See [CONTRIBUTING.md](../CONTRIBUTING.md). The detailed technical design is in [spec.md](spec.md).
