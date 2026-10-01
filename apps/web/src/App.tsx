import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CreateEventPage } from './pages/CreateEventPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'

// The style guide is a development tool. `import.meta.env.DEV` is replaced with
// a literal at build time, so in production this evaluates to `null` and the
// `lazy(() => import(...))` call becomes unreachable — which is what keeps the
// style guide out of the shipped bundle rather than merely hiding the route.
const StyleGuidePage = import.meta.env.DEV ? lazy(() => import('./pages/StyleGuidePage')) : null

export const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<EventsPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="p/:did/e/:rkey" element={<EventDetailPage />} />
      <Route path="create" element={<CreateEventPage />} />
      {StyleGuidePage === null ? null : <Route path="styleguide" element={<StyleGuidePage />} />}
      <Route path="*" element={<p>Page not found.</p>} />
    </Route>
  </Routes>
)
