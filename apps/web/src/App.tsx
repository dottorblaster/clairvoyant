import { lazy } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CreateEventPage } from './pages/CreateEventPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventsPage } from './pages/EventsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

const StyleGuidePage = import.meta.env.DEV ? lazy(() => import('./pages/StyleGuidePage')) : null

export const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<HomePage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="p/:did/e/:rkey" element={<EventDetailPage />} />
      <Route path="create" element={<CreateEventPage />} />
      {StyleGuidePage === null ? null : <Route path="styleguide" element={<StyleGuidePage />} />}
      <Route
        path="*"
        element={
          <p>
            Nothing here. <Link to="/">Back to the rack</Link>.
          </p>
        }
      />
    </Route>
  </Routes>
)
