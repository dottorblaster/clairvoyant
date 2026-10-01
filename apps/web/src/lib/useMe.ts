import { useQuery } from '@tanstack/react-query'
import { ApiError, fetchMe, type MeResponse } from './api'

/**
 * Returns `null` when the user has no session (401) instead of throwing, so
 * pages can render a logged-out state without special-casing errors.
 */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await fetchMe()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
  })
