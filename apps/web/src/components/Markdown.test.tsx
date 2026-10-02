import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { Markdown } from './Markdown'

const render = (source: string) => renderWithProviders(<Markdown>{source}</Markdown>)

describe('Markdown', () => {
  test('renders emphasis and strong text', () => {
    const { container } = render('A **bold** and _italic_ day')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
  })

  test('renders links that open safely in a new tab', () => {
    render('[Join us](https://example.com/rsvp)')
    const link = screen.getByRole('link', { name: 'Join us' })
    expect(link.getAttribute('href')).toBe('https://example.com/rsvp')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.getAttribute('rel')).toContain('nofollow')
  })

  test('autolinks bare URLs (GFM)', () => {
    render('Details at https://example.com/event')
    expect(screen.getByRole('link', { name: 'https://example.com/event' })).toBeTruthy()
  })

  test('turns single newlines into line breaks', () => {
    const { container } = render('Line one\nLine two')
    expect(container.querySelectorAll('br').length).toBe(1)
  })

  test('renders images lazily and without a referrer', () => {
    const { container } = render('![poster](https://example.com/poster.png)')
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/poster.png')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  test('shifts headings down so the page keeps a single h1', () => {
    const { container } = render('# Line up\n\n## Then\n\n### And')
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelector('h2')?.textContent).toBe('Line up')
    expect(container.querySelector('h3')?.textContent).toBe('Then')
    expect(container.querySelector('h4')?.textContent).toBe('And')
  })

  test('does not render raw HTML, but keeps the text around it', () => {
    const { container } = render('<u>underlined</u> and <script>alert(1)</script>')
    expect(container.querySelector('u')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('underlined')
  })

  test('renders GFM tables', () => {
    const { container } = render('| A | B |\n| - | - |\n| 1 | 2 |')
    expect(container.querySelectorAll('table th').length).toBe(2)
    expect(container.querySelectorAll('table td').length).toBe(2)
  })

  test('scopes prose styles under .markdown', () => {
    const { container } = render('Hello')
    expect(container.querySelector('.markdown')?.textContent).toContain('Hello')
  })
})
