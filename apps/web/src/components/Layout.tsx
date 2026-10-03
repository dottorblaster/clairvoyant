import { Button, PixelIcon, ThemeToggle } from '@clairvoyant/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../lib/api'
import { useMe } from '../lib/useMe'

export const Layout = () => {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.clear()
      navigate('/login')
    },
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand">
          <PixelIcon name="calendar" />
          Clairvoyant
        </Link>

        <nav className="app-nav" aria-label="Main">
          <NavLink to="/" end className="nav-link">
            Game rack
          </NavLink>
          <NavLink to="/events" className="nav-link">
            My shelf
          </NavLink>
          <NavLink to="/create" className="nav-link">
            New event
          </NavLink>
        </nav>

        <div className="app-account">
          <ThemeToggle />
          {me.data ? (
            <>
              <span className="app-account__identity" title={me.data.did}>
                {me.data.handle ?? me.data.did}
              </span>
              <Button
                icon="power"
                pending={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                Eject
              </Button>
            </>
          ) : (
            <NavLink to="/login" className="nav-link">
              Link up
            </NavLink>
          )}
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}
