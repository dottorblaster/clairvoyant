import { useQuery } from '@tanstack/react-query'
import { ApiError, fetchMe, type MeResponse } from './api'

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: (): Promise<MeResponse | null> =>
      fetchMe().catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          return null
        }

        throw error
      }),
    retry: false,
  })
