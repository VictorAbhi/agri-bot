"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAuthToken } from "@/lib/auth"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const token = getAuthToken()
    if (token) {
      router.push("/chat")
    } else {
      router.push("/login")
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading AgriBot...</p>
      </div>
    </div>
  )
}
