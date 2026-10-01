import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from 'react-router-dom'
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
        <nav className="app-nav">
          <Link to="/events">My events</Link>
          <Link to="/create">Create event</Link>
        </nav>
        <div className="app-account">
          {me.data ? (
            <>
              <span title={me.data.did}>{me.data.handle ?? me.data.did}</span>
              <button
                type="button"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                Log out
              </button>
            </>
          ) : (
            <Link to="/login">Log in</Link>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
