import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CreateEventPage } from './pages/CreateEventPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'

export const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<EventsPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="p/:did/e/:rkey" element={<EventDetailPage />} />
      <Route path="create" element={<CreateEventPage />} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Route>
  </Routes>
)
