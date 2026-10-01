import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, test } from 'vitest'
import {
  Badge,
  Button,
  Loading,
  Modal,
  Notice,
  Panel,
  TextArea,
  TextField,
  ThemeToggle,
  VisuallyHidden,
} from '../../dist/index.js'

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(element)

/** Pulls the first value of an attribute out of rendered markup. */
const attribute = (markup: string, name: string): string | undefined =>
  markup.match(new RegExp(`${name}="([^"]*)"`))?.[1]

/** The element's class list, so tests do not depend on class ordering. */
const classes = (markup: string): string[] =>
  (attribute(markup, 'class') ?? '').split(/\s+/).filter(Boolean)

describe('Button', () => {
  test('does not submit a surrounding form by default', () => {
    assert.match(render(createElement(Button, null, 'Save')), /type="button"/)
  })

  test('honours an explicit type', () => {
    assert.match(render(createElement(Button, { type: 'submit' }, 'Save')), /type="submit"/)
  })

  test('defaults to the outlined variant and exposes the chosen variant', () => {
    const base = classes(render(createElement(Button, null, 'x')))
    assert.ok(base.includes('btn'))
    assert.ok(base.includes('btn--default'))

    for (const variant of ['primary', 'danger', 'ghost'] as const) {
      const rendered = classes(render(createElement(Button, { variant }, 'x')))
      assert.ok(rendered.includes(`btn--${variant}`), `${variant} variant class missing`)
    }
  })

  test('pending disables the button, marks it busy and appends the cursor', () => {
    const markup = render(createElement(Button, { pending: true }, 'Saving'))
    assert.match(markup, /disabled=""/)
    assert.match(markup, /aria-busy="true"/)
    assert.match(markup, /cursor-blink/)
  })

  test('a settled button is neither disabled nor busy', () => {
    const markup = render(createElement(Button, null, 'Save'))
    assert.doesNotMatch(markup, /disabled/)
    assert.doesNotMatch(markup, /aria-busy/)
    assert.doesNotMatch(markup, /cursor-blink/)
  })

  test('iconOnly keeps the label for assistive technology', () => {
    const markup = render(createElement(Button, { iconOnly: true, icon: 'plus' }, 'Add event'))
    assert.match(markup, /btn--icon/)
    assert.match(markup, /class="visually-hidden"/)
    assert.match(markup, /Add event/)
  })
})

describe('Panel', () => {
  test('renders the title bar only when there is a title or an action', () => {
    assert.doesNotMatch(render(createElement(Panel, null, 'body')), /panel__header/)
    assert.match(render(createElement(Panel, { title: 'Events' }, 'body')), /panel__header/)
  })

  test('renders the title at the requested heading level', () => {
    assert.match(
      render(createElement(Panel, { title: 'Events', headingLevel: 1 })),
      /<h1 class="panel__title">Events<\/h1>/,
    )
    assert.match(
      render(createElement(Panel, { title: 'Events', headingLevel: 2 })),
      /<h2 class="panel__title">Events<\/h2>/,
    )
    assert.match(
      render(createElement(Panel, { title: 'Events', headingLevel: 3 })),
      /<h3 class="panel__title">Events<\/h3>/,
    )
  })

  test('defaults to h1 so a page keeps one top-level heading', () => {
    assert.match(render(createElement(Panel, { title: 'Events' })), /<h1 /)
  })

  test('flush removes body padding for full-bleed content', () => {
    assert.match(render(createElement(Panel, { variant: 'flush' }, 'x')), /panel__body--flush/)
    assert.doesNotMatch(render(createElement(Panel, null, 'x')), /panel__body--flush/)
  })

  test('renders meta as quiet small print', () => {
    const markup = render(createElement(Panel, { title: 'Events', meta: 'indexed' }))
    assert.match(markup, /class="muted small"/)
    assert.match(markup, /indexed/)
  })
})

describe('TextField', () => {
  test('associates the label with the input', () => {
    const markup = render(createElement(TextField, { label: 'Name' }))
    const id = attribute(markup, 'id')
    assert.ok(id, 'input should have an id')
    assert.match(markup, new RegExp(`<label class="field__label" for="${id}"`))
  })

  test('generates a stable id when none is given, without colliding', () => {
    const markup = render(
      createElement('div', null, [
        createElement(TextField, { key: 'a', label: 'A' }),
        createElement(TextField, { key: 'b', label: 'B' }),
      ]),
    )
    const ids = [...markup.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((match) => match[1])
    assert.equal(ids.length, 2)
    assert.notEqual(ids[0], ids[1])
    for (const id of ids) {
      assert.ok(id !== undefined && markup.includes(`for="${id}"`), `label for ${id} missing`)
    }
  })

  test('wires hint and error through aria-describedby', () => {
    const markup = render(createElement(TextField, { id: 'n', label: 'Name', hint: 'Full name' }))
    assert.match(markup, /aria-describedby="n-hint"/)
    assert.match(markup, /id="n-hint"/)

    const both = render(
      createElement(TextField, { id: 'n', label: 'Name', hint: 'Full name', error: 'Required' }),
    )
    assert.match(both, /aria-describedby="n-hint n-error"/)
  })

  test('marks the input invalid and shows the alert icon only on error', () => {
    const markup = render(createElement(TextField, { label: 'Name', error: 'Required' }))
    assert.match(markup, /aria-invalid="true"/)
    assert.match(markup, /class="field__error"/)
    assert.match(markup, /<svg/)

    const clean = render(createElement(TextField, { label: 'Name' }))
    assert.doesNotMatch(clean, /aria-invalid/)
    assert.doesNotMatch(clean, /field__error/)
  })

  test('forwards native input attributes', () => {
    const markup = render(
      createElement(TextField, { label: 'Starts', type: 'datetime-local', required: true }),
    )
    assert.match(markup, /type="datetime-local"/)
    assert.match(markup, /required=""/)
  })
})

describe('TextArea', () => {
  test('renders a textarea with the same label and error wiring', () => {
    const markup = render(
      createElement(TextArea, { id: 'd', label: 'Description', error: 'Too long', rows: 4 }),
    )
    assert.match(markup, /<textarea/)
    assert.match(markup, /class="textarea"/)
    assert.match(markup, /aria-describedby="d-error"/)
    assert.match(markup, /rows="4"/)
  })
})

describe('Badge', () => {
  test('defaults to the plain tone', () => {
    const rendered = classes(render(createElement(Badge, null, 'going')))
    assert.ok(rendered.includes('badge'))
    assert.ok(rendered.includes('badge--default'))
  })

  test('applies the requested tone', () => {
    assert.ok(
      classes(render(createElement(Badge, { tone: 'ink' }, 'going'))).includes('badge--ink'),
    )
    assert.ok(
      classes(render(createElement(Badge, { tone: 'muted' }, 'going'))).includes('badge--muted'),
    )
  })
})

describe('Notice', () => {
  test('errors are announced and use the filled danger block', () => {
    const markup = render(createElement(Notice, { tone: 'error' }, 'Could not save'))
    assert.match(markup, /role="alert"/)
    assert.match(markup, /notice--error/)
    assert.match(markup, /Could not save/)
  })

  test('other tones stay silent so they do not interrupt a screen reader', () => {
    const markup = render(createElement(Notice, { tone: 'success' }, 'Saved'))
    assert.doesNotMatch(markup, /role="alert"/)
    assert.doesNotMatch(markup, /role="status"/)
    assert.match(markup, /notice--success/)
  })

  test('info has no icon; error and success default to one', () => {
    assert.doesNotMatch(render(createElement(Notice, null, 'fyi')), /<svg/)
    assert.match(render(createElement(Notice, { tone: 'error' }, 'x')), /<svg/)
    assert.match(render(createElement(Notice, { tone: 'success' }, 'x')), /<svg/)
  })

  test('icon={null} removes the icon', () => {
    assert.doesNotMatch(render(createElement(Notice, { tone: 'error', icon: null }, 'x')), /<svg/)
  })

  test('renders a title when given one', () => {
    const markup = render(createElement(Notice, { tone: 'error', title: 'Failed' }, 'body'))
    assert.match(markup, /class="notice__title">Failed</)
  })
})

describe('Loading', () => {
  test('announces politely and shows the blinking cursor', () => {
    const markup = render(createElement(Loading, null, 'Loading events'))
    assert.match(markup, /role="status"/)
    assert.match(markup, /Loading events/)
    assert.match(markup, /cursor-blink/)
  })

  test('defaults its label', () => {
    assert.match(render(createElement(Loading, null)), /Loading/)
  })
})

describe('VisuallyHidden', () => {
  test('keeps content in the accessibility tree', () => {
    const markup = render(createElement(VisuallyHidden, null, 'Close'))
    assert.match(markup, /class="visually-hidden"/)
    assert.match(markup, /Close/)
  })
})

describe('Modal', () => {
  // `children` is a required prop on Modal, so it has to be satisfied by the
  // props object: React's createElement types will not accept it as a variadic
  // argument when the prop itself is required.
  const markup = render(
    // biome-ignore lint/correctness/noChildrenProp: see the note above.
    createElement(Modal, { title: 'Invite someone', onClose: () => {}, children: 'content' }),
  )

  test('is a labelled modal dialog', () => {
    assert.match(markup, /role="dialog"/)
    assert.match(markup, /aria-modal="true"/)
    const labelledBy = attribute(markup, 'aria-labelledby')
    assert.ok(labelledBy, 'dialog must be labelled')
    assert.ok(markup.includes(`id="${labelledBy}"`), 'aria-labelledby must resolve to the title')
  })

  test('dismisses through a real button so keyboard users can reach it', () => {
    assert.match(markup, /class="modal-overlay"/)
    assert.match(markup, /aria-label="Close dialog"/)
  })

  test('reuses the panel chrome for its title bar', () => {
    assert.match(markup, /class="panel__header"/)
    assert.match(markup, /class="panel__body"/)
  })

  test('renders its content', () => {
    assert.match(markup, /content/)
  })

  test('the dialog itself is focusable as a fallback target', () => {
    assert.match(markup, /tabindex="-1"/)
  })
})

describe('ThemeToggle', () => {
  test('renders during server rendering, where there is no DOM', () => {
    const markup = render(createElement(ThemeToggle, null))
    assert.match(markup, /theme-toggle/)
    assert.match(markup, /Theme: Auto/)
  })

  test('falls back to the dark icon when the OS preference is unknown', () => {
    const markup = render(createElement(ThemeToggle, null))
    assert.match(markup, /aria-hidden="true"/)
  })
})
