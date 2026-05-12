import { AUTH_STORAGE_KEY } from '../constants'

export function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch (err) {
    void err
  }
  return {}
}
