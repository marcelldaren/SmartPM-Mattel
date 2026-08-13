import { createContext, useContext } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: ({ username, password }) => api.login(username, password),
    onSuccess: (u) => queryClient.setQueryData(['me'], u),
  })

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // setQueryData(['me'], undefined) looks right but is a no-op: TanStack Query treats
      // `undefined` as "no update", so the stale user stayed cached and the app carried on
      // as if still signed in. Clearing the cache both drops the session and stops the next
      // person seeing the previous user's dashboard, findings, and approval queue.
      queryClient.clear()
    },
  })

  const value = {
    user: isError ? undefined : user,
    isLoading,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    loggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
