import { describe, expect, test } from 'vitest'
import { RESPONSE_LABEL, ROLE_TONE, rsvpTone } from './roles'

describe('ROLE_TONE', () => {
  test('makes hosting the loudest and interested the quietest', () => {
    expect(ROLE_TONE).toEqual({ hosting: 'ink', going: 'default', interested: 'muted' })
  })
})

describe('RESPONSE_LABEL', () => {
  test('maps each status to the copy shown after responding', () => {
    expect(RESPONSE_LABEL).toEqual({
      going: 'Going',
      notgoing: 'Not going',
      interested: 'Maybe',
    })
  })
})

describe('rsvpTone', () => {
  test('maps going, notgoing and unknown names', () => {
    expect(rsvpTone('going')).toBe('ink')
    expect(rsvpTone('notgoing')).toBe('muted')
    expect(rsvpTone('interested')).toBe('default')
    expect(rsvpTone(null)).toBe('default')
  })
})
