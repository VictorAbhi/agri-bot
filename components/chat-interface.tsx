"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Send, Sprout, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import { Sidebar } from "./Sidebar"
import { apiService } from "@/lib/api"
import { useRouter, useSearchParams } from "next/navigation"

interface Message {
  id: string
  question: string
  response?: string
  created_at: string
  isStreaming?: boolean
}

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export function ChatInterface() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const conversationId = searchParams.get('c')
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Handle mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile && isSidebarOpen) {
        setIsSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Handle URL conversation changes
  useEffect(() => {
    if (conversationId && conversationId !== currentConversation) {
      setCurrentConversation(conversationId)
    } else if (!conversationId && currentConversation) {
      setCurrentConversation(null)
      setMessages([])
    }
  }, [conversationId])

  // Load conversation messages when current conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadConversationMessages(currentConversation)
      // Update URL without triggering navigation
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('c', currentConversation)
      window.history.replaceState({}, '', newUrl.toString())
    } else {
      setMessages([])
      // Clear conversation from URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('c')
      window.history.replaceState({}, '', newUrl.toString())
    }
  }, [currentConversation])

  const loadConversations = async (retry = false) => {
    try {
      const response = await apiService.getConversations()
      if (response.success && response.data) {
        setConversations(response.data.conversations || [])
        setError(null)
      } else {
        throw new Error(response.error || "Failed to load conversations")
      }
    } catch (error) {
      console.error("Failed to load conversations:", error)
      if (!retry) {
        setTimeout(() => loadConversations(true), 2000)
      } else {
        setError("Failed to load conversations. Check your connection.")
      }
    }
  }

  const loadConversationMessages = async (conversationId: string, retry = false) => {
    try {
      const response = await apiService.getConversationMessages(conversationId)
      if (response.success && response.data) {
        setMessages(response.data.messages)
        setError(null)
      } else {
        throw new Error(response.error || "Failed to load messages")
      }
    } catch (error) {
      console.error("Failed to load messages:", error)
      if (!retry) {
        setTimeout(() => loadConversationMessages(conversationId, true), 2000)
      } else {
        setError("Failed to load messages. Please try again.")
      }
    }
  }

  const startNewConversation = () => {
    setCurrentConversation(null)
    setMessages([])
    setError(null)
    // Focus input after starting new conversation
    setTimeout(() => inputRef.current?.focus(), 100)
    
    // Close sidebar on mobile when starting new conversation
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }

  const selectConversation = (conversationId: string) => {
    setCurrentConversation(conversationId)
    setError(null)
    
    // Close sidebar on mobile when selecting conversation
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const messageText = inputMessage.trim()
    setInputMessage("")
    setIsLoading(true)
    setError(null)

    // Add message placeholder to UI immediately
    const tempId = `temp-${Date.now()}`
    const newMessage: Message = {
      id: tempId,
      question: messageText,
      created_at: new Date().toISOString(),
      response: "",
      isStreaming: true,
    }
    setMessages((prev) => [...prev, newMessage])

    let fullResponse = ""
    let streamingFailed = false

    try {
      await apiService.sendMessageStream(
        messageText,
        currentConversation,
        // onChunk
        (chunk: string) => {
          fullResponse += chunk
          setMessages((prev) =>
            prev.map((msg) => (msg.id === tempId ? { ...msg, response: fullResponse } : msg)),
          )
        },
        // onComplete
        (conversationId: string, messageId: string) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === tempId ? { ...msg, id: messageId, isStreaming: false } : msg)),
          )

          // Update current conversation if it was created and reload conversations
          if (!currentConversation && conversationId) {
            setCurrentConversation(conversationId)
          }
          loadConversations()
        },
        // onError
        (error: string) => {
          streamingFailed = true
          console.error("Streaming error:", error)
          handleStreamingFallback(messageText, tempId)
        },
      )
    } catch (error) {
      console.error("Error sending message:", error)
      if (!streamingFailed) {
        handleStreamingFallback(messageText, tempId)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStreamingFallback = async (messageText: string, tempId: string) => {
    try {
      const response = await apiService.sendMessage(messageText, currentConversation || undefined)
      if (response.success && response.data) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId
              ? {
                  ...msg,
                  id: response.data.message_id,
                  response: response.data.answer,
                  isStreaming: false,
                }
              : msg,
          ),
        )

        if (!currentConversation && response.data.conversation_id) {
          setCurrentConversation(response.data.conversation_id)
        }
        loadConversations()
      } else {
        throw new Error(response.error || "Failed to get response")
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...msg,
                response: "I'm having trouble answering your question right now. Please try again later.",
                isStreaming: false,
              }
            : msg,
        ),
      )
      setError("Failed to send message. Please try again.")
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-[#F5F5F5] to-[#E8F5E8] font-sans">
      <style jsx global>{`
        :root {
          --primary: #4CAF50;
          --primary-light: #81C784;
          --primary-dark: #388E3C;
          --secondary: #2E7D32;
          --light: #F1F8E9;
          --dark: #1B5E20;
          --gray: #757575;
          --light-gray: #E0E0E0;
          --white: #FFFFFF;
          --card-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .message-bubble strong {
          font-weight: 700;
          color: var(--secondary);
        }

        .message-bubble em {
          font-style: italic;
          color: var(--primary-dark);
        }

        .message-bubble ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .message-bubble li {
          margin: 5px 0;
          line-height: 1.4;
        }

        .message-bubble p {
          margin: 8px 0;
          line-height: 1.5;
        }

        .message-bubble h1,
        .message-bubble h2,
        .message-bubble h3 {
          color: var(--secondary);
          margin: 12px 0 8px 0;
          font-weight: 600;
        }

        .message-bubble code {
          background: rgba(76, 175, 80, 0.1);
          padding: 2px 4px;
          border-radius: 3px;
          font-family: "Courier New", monospace;
          font-size: 0.9em;
        }

        .thinking-indicator {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border-radius: 18px;
          padding: 12px 16px;
          font-size: 14px;
          color: var(--gray);
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message-animate {
          animation: slideIn 0.3s ease;
        }

        .sidebar-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 40;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        .sidebar-overlay.active {
          opacity: 1;
          pointer-events: all;
        }
      `}</style>

      {/* Mobile Sidebar Overlay */}
      {isMobile && (
        <div 
          className={cn("sidebar-overlay", isSidebarOpen && "active")}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        conversations={conversations}
        setConversations={setConversations}
        currentConversation={currentConversation}
        onNewConversation={startNewConversation}
        onSelectConversation={selectConversation}
        loadConversations={loadConversations}
        isMobile={isMobile}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex-shrink-0 p-4 border-b bg-white/80 backdrop-blur-sm shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
             <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 transition-colors block md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="bg-[#4CAF50]/10 p-2 rounded-full">
                <Sprout className="h-5 w-5 text-[#4CAF50]" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">
                  {currentConversation ? (
                    conversations.find((c) => c.id === currentConversation)?.title || "Chat"
                  ) : (
                    "AgriBot"
                  )}
                </h2>
                <p className="text-sm text-gray-600">
                  {currentConversation ? "Ask about crop diseases and farming" : "Your AI Agriculture Assistant"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex-shrink-0 p-4 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="max-w-4xl mx-auto p-4 space-y-6">
              {!currentConversation && messages.length === 0 && (
                <div className="text-center py-16">
                  <div className="bg-gradient-to-br from-[#4CAF50] to-[#2E7D32] p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-lg">
                    <Sprout className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-gray-800">Welcome to AgriBot</h3>
                  <p className="text-gray-600 mb-8 max-w-md mx-auto">
                    Your intelligent partner for crop disease diagnosis and farming guidance. Ask me anything about agriculture!
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
                    <Card className="p-6 bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                      <div className="text-3xl font-bold text-[#4CAF50] mb-2">14+</div>
                      <div className="text-sm font-medium text-gray-700">Crop Types</div>
                    </Card>
                    <Card className="p-6 bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                      <div className="text-3xl font-bold text-[#4CAF50] mb-2">120+</div>
                      <div className="text-sm font-medium text-gray-700">Diseases</div>
                    </Card>
                    <Card className="p-6 bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                      <div className="text-3xl font-bold text-[#4CAF50] mb-2">24/7</div>
                      <div className="text-sm font-medium text-gray-700">Support</div>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
                    <div className="bg-white/50 p-4 rounded-xl border border-gray-200">
                      <h4 className="font-semibold text-gray-800 mb-2">🌱 Disease Diagnosis</h4>
                      <p className="text-sm text-gray-600">Identify crop diseases from symptoms and get treatment recommendations</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-xl border border-gray-200">
                      <h4 className="font-semibold text-gray-800 mb-2">🔬 Expert Knowledge</h4>
                      <p className="text-sm text-gray-600">Access comprehensive agricultural research and best practices</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-xl border border-gray-200">
                      <h4 className="font-semibold text-gray-800 mb-2">🌾 Farming Tips</h4>
                      <p className="text-sm text-gray-600">Get personalized advice for crop management and yield improvement</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-xl border border-gray-200">
                      <h4 className="font-semibold text-gray-800 mb-2">📊 Data-Driven</h4>
                      <p className="text-sm text-gray-600">Recommendations based on latest agricultural research and data</p>
                    </div>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div key={message.id} className="space-y-4 message-animate">
                  {/* User Message */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] p-4 rounded-2xl bg-gradient-to-br from-[#4CAF50] to-[#2E7D32] text-white shadow-lg">
                      <p className="text-sm leading-relaxed">{message.question}</p>
                      <p className="text-xs opacity-70 mt-2">{formatTime(message.created_at)}</p>
                    </div>
                  </div>

                  {/* Bot Response */}
                  {(message.response || message.isStreaming) && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] p-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-lg">
                        {message.isStreaming && !message.response ? (
                          <div className="thinking-indicator">
                            <div className="flex items-center gap-2">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-[#4CAF50] rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-[#4CAF50] rounded-full animate-bounce" style={{animationDelay: "0.1s"}}></div>
                                <div className="w-2 h-2 bg-[#4CAF50] rounded-full animate-bounce" style={{animationDelay: "0.2s"}}></div>
                              </div>
                              <span>AgriBot is thinking...</span>
                            </div>
                          </div>
                        ) : (
                          <div className="message-bubble">
                            <div className="text-sm prose prose-sm max-w-none text-gray-800">
                              <ReactMarkdown>{message.response}</ReactMarkdown>
                            </div>
                            <p className="text-xs text-gray-500 mt-3">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4 bg-white/80 backdrop-blur-sm border-t">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs text-gray-500 text-center mb-3">
              Ask about crop diseases, farming techniques, or agricultural best practices
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  placeholder="Type your message..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                  className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-sm focus:border-[#4CAF50] focus:ring-0 focus:shadow-lg resize-none transition-all duration-200 bg-white/90"
                  style={{ minHeight: "48px" }}
                />
              </div>
              <Button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4CAF50] to-[#2E7D32] text-white hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200 flex-shrink-0"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}