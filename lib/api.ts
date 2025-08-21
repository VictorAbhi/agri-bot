import { getAuthToken } from "./auth"

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface ConversationResponse {
  conversations: Array<{
    id: string
    user_id: string
    title: string
    created_at: string
    updated_at: string
    share_url?: string // Optional field for shared URL
  }>
}

export interface MessagesResponse {
  messages: Array<{
    id: string
    conversation_id: string
    user_id: string
    question: string
    response?: string
    created_at: string
  }>
}

export interface ChatResponse {
  answer: string
  conversation_id: string
  message_id: string
}

export interface UserStatsResponse {
  stats: {
    total_conversations: number
    total_messages: number
    recent_activity: boolean
  }
}

export interface ShareResponse {
  share_url: string
}

class ApiService {
  private baseUrl: string
  private retryAttempts = 3
  private retryDelay = 1000

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://agri-bot-chfh.onrender.com"
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = getAuthToken()

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, config)

        if (response.status === 401) {
          localStorage.removeItem("agribot_token")
          localStorage.removeItem("agribot_user")
          window.location.href = "/login"
          throw new Error("Authentication required")
        }

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`)
        }

        return {
          success: true,
          data: data,
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error occurred")

        if (error instanceof Error && (error.message.includes("Authentication") || error.message.includes("4"))) {
          break
        }

        if (attempt < this.retryAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt)))
        }
      }
    }

    console.error(`API Error (${endpoint}) after ${this.retryAttempts} attempts:`, lastError)
    return {
      success: false,
      error: lastError?.message || "Network error occurred",
      message: "Failed to complete the request. Please try again later.",
    }
  }

  // Authentication APIs
  async login(email: string, password: string) {
    return this.request<{ token: string; user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  }

  async signup(userData: {
    email: string
    password: string
    full_name: string
    phone?: string
    location?: string
    farm_type?: string
    experience_level?: string
    preferred_crops?: string[]
  }) {
    return this.request<{ user_id: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(userData),
    })
  }

  async getProfile() {
    return this.request<{ user: any }>("/api/auth/profile")
  }

  async updateProfile(updates: Record<string, any>) {
    return this.request<{ user: any }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(updates),
    })
  }

  async logout() {
    return this.request("/api/auth/logout", {
      method: "POST",
    })
  }

  // Conversation APIs
  async getConversations(): Promise<ApiResponse<ConversationResponse>> {
    return this.request<ConversationResponse>("/api/conversations")
  }

  async createConversation(title = "New Conversation"): Promise<ApiResponse<{ conversation_id: string }>> {
    const user = JSON.parse(localStorage.getItem("agribot_user") || "{}")
    if (!user?.id) {
      return {
        success: false,
        error: "User not authenticated",
        message: "Please log in to create a conversation.",
      }
    }
    const response = await this.request<{ conversation_id: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title, user_id: user.id }),
    });
    if (response.success) {
      // Immediately refresh conversations to update UI
      await this.getConversations().then((convResponse) => {
        if (convResponse.success && convResponse.data) {
          setConversations(convResponse.data.conversations); // Assuming setConversations is accessible or passed as prop
        }
      });
    }
    return response;
  }

  async updateConversation(conversationId: string, title: string) {
    return this.request(`/api/conversations/${conversationId}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    })
  }

  async deleteConversation(conversationId: string) {
    return this.request(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    })
  }

  async shareConversation(conversationId: string): Promise<ApiResponse<ShareResponse>> {
    return this.request<ShareResponse>(`/api/conversations/${conversationId}/share`, {
      method: "POST",
    });
  }

  // Message APIs
  async getConversationMessages(conversationId: string): Promise<ApiResponse<MessagesResponse>> {
    return this.request<MessagesResponse>(`/api/conversations/${conversationId}/messages`)
  }

  async getRecentMessages(limit = 50): Promise<ApiResponse<MessagesResponse>> {
    return this.request<MessagesResponse>(`/api/messages/recent?limit=${limit}`)
  }

  async sendMessage(message: string, conversationId?: string): Promise<ApiResponse<ChatResponse>> {
    const user = JSON.parse(localStorage.getItem("agribot_user") || "{}")
    if (!user?.id) {
      return {
        success: false,
        error: "User not authenticated",
        message: "Please log in to send a message.",
      }
    }
    return this.request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(conversationId && { conversation_id: conversationId }),
        user_id: user.id,
      }),
    })
  }

  async sendMessageStream(
    message: string,
    conversationId: string | null,
    onChunk: (chunk: string) => void,
    onComplete: (conversationId: string, messageId: string) => void,
    onError: (error: string) => void,
  ) {
    const token = getAuthToken()
    const user = JSON.parse(localStorage.getItem("agribot_user") || "{}")
    if (!user?.id) {
      onError("User not authenticated. Please log in.")
      return
    }

    let retryCount = 0
    const maxRetries = 2

    const attemptStream = async (): Promise<void> => {
      try {
        const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            message,
            ...(conversationId && { conversation_id: conversationId }),
            user_id: user.id,
          }),
        })

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem("agribot_token")
            localStorage.removeItem("agribot_user")
            window.location.href = "/login"
            throw new Error("Authentication required")
          }
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let currentConversationId = conversationId
        let currentMessageId = ""

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6))

                  if (data.conversation_id) {
                    currentConversationId = data.conversation_id
                  }
                  if (data.message_id) {
                    currentMessageId = data.message_id
                  }

                  if (data.content) {
                    onChunk(data.content)
                  }

                  if (data.done) {
                    if (currentConversationId && currentMessageId) {
                      onComplete(currentConversationId, currentMessageId)
                    } else {
                      onError("Incomplete response: missing conversation or message ID")
                    }
                    return
                  }
                } catch (parseError) {
                  console.warn("Failed to parse SSE data:", line)
                }
              }
            }
          }
        } else {
          throw new Error("Failed to get response body")
        }
      } catch (error) {
        console.error("Streaming error:", error)

        if (retryCount < maxRetries && !error?.message?.includes("401")) {
          retryCount++
          console.log(`Retrying stream (attempt ${retryCount}/${maxRetries})...`)
          setTimeout(() => attemptStream(), 1000 * retryCount)
        } else {
          onError(error instanceof Error ? error.message : "Unknown streaming error")
        }
      }
    }
    

    await attemptStream()
  }

  
  // Search APIs
  async searchConversations(query: string) {
    return this.request(`/api/search/conversations?q=${encodeURIComponent(query)}`)
  }

  async searchMessages(query: string, limit = 20) {
    return this.request(`/api/search/messages?q=${encodeURIComponent(query)}&limit=${limit}`)
  }

  // Stats API
  async getUserStats(): Promise<ApiResponse<UserStatsResponse>> {
    return this.request<UserStatsResponse>("/api/stats/user")
  }

  // Health check
  async healthCheck() {
    return this.request("/health")
  }
}

export const apiService = new ApiService()