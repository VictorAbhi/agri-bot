"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Menu,
  MessageSquare,
  Search,
  Settings,
  LogOut,
  User,
  MoreVertical,
  Trash2,
  Edit3,
  Plus,
  ChevronLeft,
  ArrowRightCircle,
  Sprout,
  Share2
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getUser, logout } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { apiService } from "@/lib/api"

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface SidebarProps {
  isSidebarOpen: boolean
  setIsSidebarOpen: (open: boolean) => void
  conversations: Conversation[]
  setConversations: (conversations: Conversation[]) => void
  currentConversation: string | null
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
  loadConversations: (retry?: boolean) => Promise<void>
  isMobile: boolean
}

export function Sidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  conversations,
  setConversations,
  currentConversation,
  onNewConversation,
  onSelectConversation,
  loadConversations,
  isMobile,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [editingConversation, setEditingConversation] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState<string | null>(null)
  const user = getUser()

  const handleDeleteConversation = async (conversationId: string) => {
    setIsDeleting(conversationId)
    try {
      const response = await apiService.deleteConversation(conversationId)
      if (response.success) {
        await loadConversations()
        if (currentConversation === conversationId) {
          onNewConversation()
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error)
    } finally {
      setIsDeleting(null)
    }
  }

  const handleShareConversation = async (conversationId: string) => {
    setIsSharing(conversationId)
    try {
      const response = await apiService.shareConversation(conversationId)
      if (response.success && response.share_url) {
        const shareLink = `${window.location.origin}/shared?c=${response.share_url}`
        await navigator.clipboard.writeText(shareLink)
        alert('Share link copied to clipboard!')
      } else {
        throw new Error(response.error || "Failed to generate share link")
      }
    } catch (error) {
      console.error("Failed to share conversation:", error)
      alert('Failed to generate share link. Please try again.')
    } finally {
      setIsSharing(null)
    }
  }

  const startEditingConversation = (conversation: Conversation) => {
    setEditingConversation(conversation.id)
    setEditTitle(conversation.title)
  }

  const saveConversationTitle = async () => {
    if (!editingConversation || !editTitle.trim()) return

    try {
      const response = await apiService.updateConversation(editingConversation, editTitle.trim())
      if (response.success) {
        await loadConversations()
        setEditingConversation(null)
        setEditTitle("")
      }
    } catch (error) {
      console.error("Failed to update conversation:", error)
    }
  }

  const cancelEditingConversation = () => {
    setEditingConversation(null)
    setEditTitle("")
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return "Today"
    if (diffDays === 2) return "Yesterday"
    if (diffDays <= 7) return `${diffDays - 1} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const filteredConversations = (conversations || []).filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const truncateTitle = (title: string, maxLength: number = 40) => {
    return title.length > maxLength ? title.substring(0, maxLength) + "..." : title
  }

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    if (isMobile && isSidebarOpen) {
      const handleOutsideClick = (e: MouseEvent) => {
        if (!document.querySelector('.sidebar')?.contains(e.target as Node)) {
          setIsSidebarOpen(false)
        }
      }
      document.addEventListener('click', handleOutsideClick)
      return () => document.removeEventListener('click', handleOutsideClick)
    }
  }, [isMobile, isSidebarOpen, setIsSidebarOpen])

  return (
    <>
      <div
        className={cn(
          "sidebar flex flex-col border-r border-gray-200 transition-all duration-300 ease-in-out shadow-lg z-50",
          isSidebarOpen
            ? "bg-white w-80 translate-x-0"
            : isMobile
            ? "bg-white fixed inset-y-0 left-0 w-80 -translate-x-full"
            : "bg-black w-16 translate-x-0"
        )}
      >
        {isSidebarOpen ? (
          <>
            {/* Sidebar Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-gradient-to-r from-[#4CAF50] to-[#2E7D32]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <Sprout className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-white">
                    <h1 className="font-bold text-lg">AgriBot</h1>
                    <p className="text-xs opacity-90">AI Agriculture Assistant</p>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              <Button
                onClick={onNewConversation}
                className="w-full bg-white/20 text-white hover:bg-white/30 border-white/30 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>

            {/* Search */}
            <div className="flex-shrink-0 p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-gray-200 text-sm focus:border-[#4CAF50] focus:ring-0 bg-gray-50 hover:bg-white transition-colors"
                />
              </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                  {filteredConversations.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {searchQuery ? "No conversations found" : "No conversations yet"}
                      </p>
                      {!searchQuery && (
                        <p className="text-xs mt-1">Start a new chat to begin!</p>
                      )}
                    </div>
                  ) : (
                    filteredConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer group transition-all duration-200 hover:bg-gray-50 relative",
                          currentConversation === conversation.id && "bg-[#F1F8E9] border border-[#4CAF50]/30"
                        )}
                        onClick={() => {
                          onSelectConversation(conversation.id)
                          if (isMobile) setIsSidebarOpen(false)
                        }}
                      >
                        <div className="flex-shrink-0">
                          <MessageSquare className={cn(
                            "h-4 w-4 transition-colors",
                            currentConversation === conversation.id ? "text-[#4CAF50]" : "text-gray-400"
                          )} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate transition-colors",
                            currentConversation === conversation.id ? "text-[#2E7D32]" : "text-gray-800"
                          )}>
                            {truncateTitle(conversation.title)}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {formatDate(conversation.updated_at)}
                          </p>
                        </div>

                        <div className="flex-shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0 hover:bg-gray-200 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEditingConversation(conversation)
                                }}
                                className="cursor-pointer"
                              >
                                <Edit3 className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleShareConversation(conversation.id)
                                }}
                                className="cursor-pointer"
                                disabled={isSharing === conversation.id}
                              >
                                <Share2 className="h-4 w-4 mr-2" />
                                {isSharing === conversation.id ? "Sharing..." : "Share"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 cursor-pointer focus:text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteConversation(conversation.id)
                                }}
                                disabled={isDeleting === conversation.id}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {isDeleting === conversation.id ? "Deleting..." : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Active conversation indicator */}
                        {currentConversation === conversation.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4CAF50] rounded-r-full" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* User Profile */}
            <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-[#4CAF50] text-white font-semibold">
                    {user?.full_name?.charAt(0)?.toUpperCase() || <User className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-gray-800">
                    {user?.full_name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {user?.experience_level || "Farmer"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-gray-200">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={logout} 
                      className="text-red-600 cursor-pointer focus:text-red-600"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        ) : (
          // Collapsed view
          <div className="h-full flex flex-col items-center pt-4 pb-4 space-y-6">
            {/* Hamburger Menu for Mobile, Logo with Expand Button for Desktop */}
            {isMobile ? (
              <Button
                variant="ghost"
                className="p-2 hover:bg-gray-800 rounded-full text-white"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            ) : (
              <div className="group relative">
                <Button
                  variant="ghost"
                  className="p-2 hover:bg-gray-800 rounded-full text-white"
                >
                  <Sprout className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute hidden group-hover:flex items-center -top-1 -right-6 text-white bg-gray-800 hover:bg-gray-700 rounded-full p-1 transition-all duration-200"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <ArrowRightCircle className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Search - only show in collapsed desktop view */}
            {!isMobile && (
              <Button
                variant="ghost"
                className="p-2 hover:bg-gray-800 rounded-full text-white"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
            )}

            {/* New Chat */}
            <Button
              variant="ghost"
              className="p-2 hover:bg-gray-800 rounded-full text-white"
              onClick={onNewConversation}
            >
              <Plus className="h-5 w-5" />
            </Button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User */}
            <Button
              variant="ghost"
              className="p-2 hover:bg-gray-800 rounded-full text-white"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-[#4CAF50] text-white text-xs font-semibold">
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </div>
        )}
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Edit Conversation Dialog */}
      <Dialog open={editingConversation !== null} onOpenChange={(open) => !open && cancelEditingConversation()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Enter new title..."
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  saveConversationTitle()
                }
              }}
              className="border-gray-200 focus:border-[#4CAF50] focus:ring-0"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={cancelEditingConversation}
                className="border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button
                onClick={saveConversationTitle}
                disabled={!editTitle.trim()}
                className="bg-gradient-to-r from-[#4CAF50] to-[#2E7 /

E7D32] text-white hover:from-[#388E3C] hover:to-[#1B5E20]"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}