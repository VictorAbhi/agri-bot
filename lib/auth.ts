export interface User {
  id: string
  full_name: string
  email?: string
  avatar_url?: string
  phone?: string
  location?: string
  farm_type?: string
  experience_level?: "beginner" | "intermediate" | "advanced"
  theme?: "light" | "dark" | "system"
  language?: string
  preferred_crops?: string[]
  created_at: string
  updated_at: string
}

export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null
  const token = localStorage.getItem("agribot_token")
  
  // Check if token exists and is not the string "undefined" or "null"
  if (!token || token === "undefined" || token === "null") return null
  
  return token
}

export const getUser = (): User | null => {
  if (typeof window === "undefined") return null
  const userStr = localStorage.getItem("agribot_user")
  
  // Check if userStr is null, empty, or the string "undefined"
  if (!userStr || userStr === "undefined") return null
  
  try {
    return JSON.parse(userStr)
  } catch (error) {
    // If JSON parsing fails, remove the corrupted data and return null
    localStorage.removeItem("agribot_user")
    return null
  }
}

export const logout = () => {
  if (typeof window === "undefined") return
  localStorage.removeItem("agribot_token")
  localStorage.removeItem("agribot_user")
  window.location.href = "/login"
}

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken()
  
  // Debug logging
  console.log('API Request:', { url, hasToken: !!token, token: token?.substring(0, 20) + '...' })

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    console.log('401 Unauthorized - clearing auth data')
    logout()
    throw new Error("Unauthorized")
  }

  return response
}