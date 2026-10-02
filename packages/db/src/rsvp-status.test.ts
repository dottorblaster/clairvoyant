import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ALL_RAW_STATUS_VALUES,
  ATTENDING_RAW_STATUS_VALUES,
  isAttendingStatusName,
  RSVP_STATUS_NAMES,
  RSVP_STATUS_RANK,
  rawValuesFor,
  rsvpStatusName,
} from '../dist/rsvp-status.js'

const REF = 'community.lexicon.calendar.rsvp#'

describe('rsvpStatusName', () => {
  test('reads the ref form the lexicon declares', () => {
    assert.equal(rsvpStatusName(`${REF}going`), 'going')
    assert.equal(rsvpStatusName(`${REF}interested`), 'interested')
    assert.equal(rsvpStatusName(`${REF}notgoing`), 'notgoing')
  })

  test('reads the bare form other clients write', () => {
    assert.equal(rsvpStatusName('going'), 'going')
    assert.equal(rsvpStatusName('interested'), 'interested')
    assert.equal(rsvpStatusName('notgoing'), 'notgoing')
  })

  test('returns null for anything it does not recognise, rather than guessing', () => {
    const unknown = [
      '',
      REF,
      'maybe',
      'GOING',
      `${REF}maybe`,
      'community.lexicon.calendar.rsvp',
      'com.example.other#going',
      ' going',
      `${REF}going `,
    ]
    for (const raw of unknown) {
      assert.equal(rsvpStatusName(raw), null, `expected null for ${JSON.stringify(raw)}`)
    }
  })
})

describe('raw value lists', () => {
  test('rawValuesFor covers both spellings of a status', () => {
    assert.deepEqual(rawValuesFor('going'), ['going', `${REF}going`])
  })

  test('ALL_RAW_STATUS_VALUES covers every status in both spellings', () => {
    assert.equal(ALL_RAW_STATUS_VALUES.length, RSVP_STATUS_NAMES.length * 2)
    for (const name of RSVP_STATUS_NAMES) {
      assert.ok(ALL_RAW_STATUS_VALUES.includes(name), `${name} missing`)
      assert.ok(ALL_RAW_STATUS_VALUES.includes(`${REF}${name}`), `${REF}${name} missing`)
    }
  })

  test('the attending list excludes notgoing, in both spellings', () => {
    assert.deepEqual(ATTENDING_RAW_STATUS_VALUES, [
      'going',
      `${REF}going`,
      'interested',
      `${REF}interested`,
    ])
    assert.ok(!ATTENDING_RAW_STATUS_VALUES.includes('notgoing'))
    assert.ok(!ATTENDING_RAW_STATUS_VALUES.includes(`${REF}notgoing`))
  })

  test('every raw value round-trips back to a known name', () => {
    for (const raw of ALL_RAW_STATUS_VALUES) {
      assert.notEqual(rsvpStatusName(raw), null, `${raw} does not round-trip`)
    }
  })
})

describe('status ranking', () => {
  test('going outranks interested, which outranks notgoing', () => {
    assert.ok(RSVP_STATUS_RANK.going < RSVP_STATUS_RANK.interested)
    assert.ok(RSVP_STATUS_RANK.interested < RSVP_STATUS_RANK.notgoing)
  })

  test('isAttendingStatusName accepts only the two attending statuses', () => {
    assert.ok(isAttendingStatusName('going'))
    assert.ok(isAttendingStatusName('interested'))
    assert.ok(!isAttendingStatusName('notgoing'))
  })
})
