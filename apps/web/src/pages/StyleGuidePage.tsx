import {
  Badge,
  type BadgeTone,
  Button,
  type ButtonVariant,
  ICON_NAMES,
  Loading,
  Modal,
  Notice,
  type NoticeTone,
  Panel,
  PixelIcon,
  TextArea,
  TextField,
  ThemeToggle,
} from '@clairvoyant/ui'
import { type ReactNode, useState } from 'react'
import './styleguide.css'

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Panel title={title} headingLevel={2}>
    {children}
  </Panel>
)

const RAMPS: Array<[string, string]> = [
  ['--dmg-0', 'shade 0 — ink'],
  ['--dmg-1', 'shade 1'],
  ['--dmg-2', 'shade 2'],
  ['--dmg-3', 'shade 3 — screen'],
  ['--nes-red', 'NES red — danger only'],
  ['--nes-red-ink', 'NES red, darkened for text'],
  ['--crt-0', 'CRT night backdrop'],
  ['--crt-1', 'CRT deep'],
]

const SEMANTIC = [
  '--bg',
  '--surface',
  '--surface-inset',
  '--fg',
  '--fg-muted',
  '--border',
  '--border-strong',
  '--focus',
  '--action-bg',
  '--action-fg',
  '--danger-bg',
  '--danger-fg',
  '--danger-text',
  '--panel-head-bg',
  '--panel-head-fg',
  '--shadow-color',
]

const TYPE_SCALE: Array<[string, string]> = [
  ['--text-2xl', 'Display'],
  ['--text-xl', 'Page title'],
  ['--text-lg', 'Section title'],
  ['--text-md', 'Body copy'],
  ['--text-sm', 'Label / meta'],
  ['--text-xs', 'Badge'],
]

const SPACE_SCALE = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6']

const BUTTON_VARIANTS: ButtonVariant[] = ['default', 'primary', 'danger', 'ghost']
const NOTICE_TONES: NoticeTone[] = ['info', 'success', 'error']
const BADGE_TONES: BadgeTone[] = ['default', 'ink', 'muted']

const Swatch = ({ token, label }: { token: string; label: string }) => (
  <li className="sg-swatch">
    <span className="sg-swatch__chip" style={{ background: `var(${token})` }} />
    <span className="sg-swatch__meta">
      <span className="mono">{token}</span>
      <span className="muted small">{label}</span>
    </span>
  </li>
)

const StyleGuidePage = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [scanlines, setScanlines] = useState(true)

  const toggleScanlines = () => {
    const next = !scanlines
    setScanlines(next)
    document.documentElement.dataset.scanlines = next ? 'on' : 'off'
  }

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <h1>Clairvoyant UI</h1>
        <p className="muted">
          Four shades of green, hard shadows, zero rounded corners. Every component, token and state
          in the kit.
        </p>
        <div className="cluster">
          <ThemeToggle />
          <Button onClick={toggleScanlines}>{`Scanlines: ${scanlines ? 'on' : 'off'}`}</Button>
        </div>
      </header>

      <Section title="Colour — the raw ramp">
        <p className="muted small">
          Four DMG shades plus one accent. Nothing else is a colour in this system.
        </p>
        <ul className="sg-swatches">
          {RAMPS.map(([token, label]) => (
            <Swatch key={token} token={token} label={label} />
          ))}
        </ul>
      </Section>

      <Section title="Colour — semantic tokens">
        <p className="muted small">
          What components actually consume. These resolve differently per theme, so switch the theme
          above and watch this section change.
        </p>
        <ul className="sg-swatches">
          {SEMANTIC.map((token) => (
            <Swatch key={token} token={token} label="theme-dependent" />
          ))}
        </ul>
      </Section>

      <Section title="Type scale">
        <p className="muted small">
          No webfont is shipped, so both roles are the system monospace. Display text is separated
          by case, weight and tracking — swap <code>--font-pixel</code> to adopt a real pixel face.
        </p>
        <ul className="sg-type">
          {TYPE_SCALE.map(([token, sample]) => (
            <li key={token}>
              <span className="sg-type__sample" style={{ fontSize: `var(${token})` }}>
                {sample}
              </span>
              <span className="mono muted small">{token}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Spacing — the 4px grid">
        <ul className="sg-space">
          {SPACE_SCALE.map((token) => (
            <li key={token}>
              <span className="sg-space__bar" style={{ width: `var(${token})` }} />
              <span className="mono muted small">{token}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Icons — ${ICON_NAMES.length} sprites`}>
        <p className="muted small">
          Hand-authored 8x8 grids. Multiples of 8 stay perfectly crisp because each cell is a
          square.
        </p>
        <ul className="sg-icons">
          {ICON_NAMES.map((name) => (
            <li key={name}>
              <span className="sg-icons__sizes">
                <PixelIcon name={name} size={16} />
                <PixelIcon name={name} size={24} />
                <PixelIcon name={name} size={32} />
              </span>
              <span className="mono muted small">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="sg-matrix">
          {BUTTON_VARIANTS.map((variant) => (
            <div className="sg-matrix__row" key={variant}>
              <span className="mono muted small">{variant}</span>
              <div className="cluster">
                <Button variant={variant}>Action</Button>
                <Button variant={variant} icon="plus">
                  With icon
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
                <Button variant={variant} pending>
                  Pending
                </Button>
                <Button variant={variant} iconOnly icon="cross">
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fields">
        <div className="sg-columns">
          <TextField label="Handle" placeholder="alice.bsky.social" />
          <TextField label="With a hint" hint="Resolved to a DID server-side." />
          <TextField
            label="With an error"
            defaultValue="not a handle"
            error="That handle is invalid."
          />
          <TextField label="Disabled" disabled defaultValue="locked" />
          <TextArea label="Textarea" rows={3} placeholder="Optional description" />
        </div>
      </Section>

      <Section title="Badges">
        <div className="cluster">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
          <Badge tone="ink" icon="check">
            going
          </Badge>
          <Badge tone="muted" icon="cross">
            notgoing
          </Badge>
        </div>
      </Section>

      <Section title="Notices">
        <div className="stack">
          {NOTICE_TONES.map((tone) => (
            <Notice key={tone} tone={tone} title={tone}>
              A {tone} message. Errors are filled red and carry <code>role="alert"</code> so they
              are announced. The other tones stay silent.
            </Notice>
          ))}
        </div>
      </Section>

      <Section title="Loading">
        <Loading>Reading the shelf</Loading>
      </Section>

      <Section title="Panels">
        <div className="sg-columns">
          <Panel title="With a title bar" headingLevel={3}>
            <p>The inverted title bar is the panel&apos;s only ornament.</p>
          </Panel>
          <Panel headingLevel={3}>
            <p>No title, no bar — the body padding is all that changes.</p>
          </Panel>
        </div>
        <Panel title="Flush body" headingLevel={3} variant="flush">
          <ul className="data-list">
            <li>
              <span className="data-list__link">Zine swap</span>
              <span className="data-list__meta">12 Mar 2026, 18:00</span>
            </li>
            <li>
              <span className="data-list__link">Retro game night</span>
              <span className="data-list__meta">14 Mar 2026, 20:00</span>
            </li>
          </ul>
        </Panel>
      </Section>

      <Section title="Modal">
        <p className="muted small">
          Escape, backdrop click, scroll locking and focus restoration all come from the component.
        </p>
        <div className="cluster">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
        </div>
      </Section>

      {modalOpen ? (
        <Modal title="Invite someone" onClose={() => setModalOpen(false)}>
          <div className="stack">
            <p>Dialogs reuse the panel chrome: the same title bar, the same hard shadow.</p>
            <TextField label="Their handle" placeholder="alice.bsky.social" />
            <div className="cluster">
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Make invite link
              </Button>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

export default StyleGuidePage
