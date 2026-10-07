// The game in the "Try it here" editor. Short on purpose: every line is a rule
// a first-timer can read, and the comments invite the first edit.
export const DEMO_SOURCE = `# Gems: collect them with the arrow keys.
# Try: change 2 to 4, or gold to hotpink.

game
  size 320 by 180
  background #10141c

gems starts at 0

thing player
  looks like #3fbf8f box 12 by 12
  starts at 154, 84

thing gem
  looks like gold circle 4

when game starts
  make a gem at 60, 50

when left key is held
  move player left 2
when right key is held
  move player right 2
when up key is held
  move player up 2
when down key is held
  move player down 2

when player touches gem
  remove the gem
  add 1 to gems
  make a gem at random 16 to 304, random 24 to 164

always
  show text "Gems {gems}" at 8, 14
`
