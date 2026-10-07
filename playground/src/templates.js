// Starting points for new projects and new files.

/** A small game that already moves with keyboard, gamepad and touch. */
export const STARTER_GAME = `# My game
# Arrow keys, WASD, a gamepad, or the on-screen buttons on a phone.

game
  size 320 by 180
  pixel art
  background midnight blue
  touch buttons

control go-left
  left key
  a key
  gamepad left

control go-right
  right key
  d key
  gamepad right

control go-up
  up key
  w key
  gamepad up

control go-down
  down key
  s key
  gamepad down

stars starts at 0

thing player
  looks like gold box 10 by 10
  starts at 155, 85

thing star
  looks like white circle 2

when go-left is held
  move player left 2
when go-right is held
  move player right 2
when go-up is held
  move player up 2
when go-down is held
  move player down 2

when every 1 second
  make a star at random 10 to 310, random 10 to 170

when player touches star
  remove the star
  add 1 to stars
  log "got a star, now {stars}"

always
  show text "Stars: {stars}" at 6, 12
`

/** A new, empty game file. */
export const NEW_FILE = `game
  size 320 by 180
  background black

thing player
  looks like white box 10 by 10
  starts at 155, 85

when right key is held
  move player right 2
`
