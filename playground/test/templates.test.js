import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { NEW_FILE, STARTER_GAME } from '../src/templates.js'

describe('templates', () => {
  it('compile with no problems', () => {
    expect(compile(STARTER_GAME).errors).toEqual([])
    expect(compile(NEW_FILE).errors).toEqual([])
  })
})
