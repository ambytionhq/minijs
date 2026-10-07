// Help: the whole language on one searchable page, plus keyboard shortcuts.

import { openDialog } from './dialog.js'

/** @type {Array<{ title: string; rows: Array<[string, string]> }>} */
export const REFERENCE = [
  {
    title: 'Blocks',
    rows: [
      ['game', 'Settings: size 320 by 180, pixel art, background navy, gravity 0.4, touch buttons'],
      ['score starts at 0', 'A number the game remembers'],
      ['thing coin', 'A kind of thing. The lines under it say how it looks and acts'],
      ['control jump', 'One action from many inputs: space key, gamepad a, right mouse'],
      ['map', 'A level drawn with letters in quotes, then "#" is wall for each letter'],
      ['when <something happens>', 'A rule. The indented lines under it are what to do'],
      ['always', 'A rule that runs every moment'],
    ],
  },
  {
    title: 'Things',
    rows: [
      ['looks like gold circle 4', 'Also: red box 12 by 16, or a picture: looks like "hero.png"'],
      ['animation walk "a.png", "b.png" at 8 fps', 'Pictures to flip through. Start it with: play walk on hero'],
      ['starts at 40, 100', 'One copy appears there when the game starts. Repeat the line for more'],
      ['size 16 by 16', 'Change the size'],
      ['solid', 'Other solid things can\'t pass through it'],
      ['fixed', 'Never pushed around by gravity or other things'],
      ['falls', 'Pulled down by gravity'],
      ['camera follows', 'The screen follows it'],
    ],
  },
  {
    title: 'Maps',
    rows: [
      ['map', 'Start a map. Lines under it: rows in quotes, then what each letter means'],
      ['"#..c..#"', 'One row. "." and spaces are empty'],
      ['"#" is wall', 'Each # becomes a wall'],
      ['tiles 16 by 16', 'How far apart letters are (16 by 16 if you leave it out)'],
      ['at 0, 0', 'Where the top-left letter goes'],
    ],
  },
  {
    title: 'When',
    rows: [
      ['when game starts', 'Once, at the start'],
      ['when space key is pressed', 'Also is held (every moment) and is released. any key works too'],
      ['when mouse is clicked', 'Also right mouse, middle mouse, is held, is released, and on the button'],
      ['when gamepad a is pressed', 'Gamepad 1. Also gamepad 2 start, and every state'],
      ['when jump is pressed', 'A control, so keys, gamepads and the mouse all work'],
      ['when player touches coin', 'While they overlap. coin means the coin that was touched'],
      ['when rock leaves the screen', 'Once, when it goes fully off screen'],
      ['when every 2 seconds', 'Again and again'],
      ['when after 5 seconds', 'Once'],
      ['when score is 10', 'Once, the moment it becomes true'],
      ['... and player is on ground', 'Add a condition to any of them'],
    ],
  },
  {
    title: 'Conditions',
    rows: [
      ['score is 10', 'Also is not, is above (more than), is below (less than)'],
      ['player is on ground', 'Standing on something solid'],
      ['left key is held', 'Also mouse is held, gamepad a is held, jump is held'],
      ['mouse is over the button', 'The pointer is on it'],
      ['... and ... / ... or ... / not ...', 'Join conditions'],
    ],
  },
  {
    title: 'Numbers',
    rows: [
      ['12, score, player x', 'Also y, vx, vy, width, height'],
      ['count of coin', 'How many coins exist'],
      ['mouse x', 'Where the pointer is'],
      ['gamepad stick x', 'From -1 to 1. Also right stick y, gamepad 2 stick x'],
      ['random 1 to 6', 'A whole number, picked fresh each time'],
      ['score - 1', '+ - * / with spaces around them'],
    ],
  },
  {
    title: 'Actions',
    rows: [
      ['move player left 2', 'Moves now, stopped by solid things'],
      ['push player up 7', 'Adds speed in that direction'],
      ['stop player', 'Sets its speed to 0'],
      ['set score to 0', 'Also set player x to 40 (or y, vx, vy)'],
      ['add 1 to score', 'Also subtract 1 from lives'],
      ['make a coin at 100, 40', 'Adds a new one'],
      ['remove the coin', 'Takes it away'],
      ['change player to look like red box 4 by 4', 'A new look'],
      ['play walk on player', 'Also stop animation on player'],
      ['show text "Score: {score}" at 4, 4 in yellow', 'Words on the screen. {...} shows a number'],
      ['log "score is {score}"', 'A line in the Console tab'],
      ['stop game', 'Also restart game'],
    ],
  },
]

const SHORTCUTS = /** @type {Array<[string, string]>} */ ([
  ['Ctrl or Cmd + S', 'Save and run'],
  ['Ctrl or Cmd + Enter', 'Run'],
  ['F2', 'Rename the selected file'],
  ['Delete', 'Delete the selected file'],
  ['Arrow keys', 'Move around the file list'],
  ['Escape', 'Close a dialog'],
])

export function openHelp() {
  return openDialog({
    title: 'Help',
    description: 'Everything minijs understands, on one page. Type to search.',
    width: '760px',
    render(body) {
      const search = document.createElement('input')
      search.type = 'search'
      search.className = 'help-search'
      search.placeholder = 'Search, like "jump" or "picture"'
      search.setAttribute('aria-label', 'Search the reference')
      const list = document.createElement('div')
      list.className = 'help-list'
      const empty = document.createElement('p')
      empty.className = 'muted'
      empty.textContent = 'Nothing matches. Try another word.'

      const draw = () => {
        const q = search.value.trim().toLowerCase()
        list.replaceChildren()
        let shown = 0
        for (const section of REFERENCE) {
          const rows = section.rows.filter(([a, b]) => !q || `${a} ${b} ${section.title}`.toLowerCase().includes(q))
          if (rows.length === 0) continue
          shown += rows.length
          const box = document.createElement('section')
          const h = document.createElement('h3')
          h.textContent = section.title
          const dl = document.createElement('dl')
          for (const [code, meaning] of rows) {
            const dt = document.createElement('dt')
            const c = document.createElement('code')
            c.textContent = code
            dt.append(c)
            const dd = document.createElement('dd')
            dd.textContent = meaning
            dl.append(dt, dd)
          }
          box.append(h, dl)
          list.append(box)
        }
        if (!q) {
          const box = document.createElement('section')
          const h = document.createElement('h3')
          h.textContent = 'Keyboard shortcuts'
          const dl = document.createElement('dl')
          for (const [keys, does] of SHORTCUTS) {
            const dt = document.createElement('dt')
            const k = document.createElement('kbd')
            k.textContent = keys
            dt.append(k)
            const dd = document.createElement('dd')
            dd.textContent = does
            dl.append(dt, dd)
          }
          box.append(h, dl)
          list.append(box)
        }
        empty.hidden = shown > 0 || !q
      }
      search.addEventListener('input', draw)
      draw()
      body.append(search, list, empty)
    },
  })
}
