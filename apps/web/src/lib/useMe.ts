import { useQuery } from '@tanstack/react-query'
import { ApiError, fetchMe, type MeResponse } from './api'

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
