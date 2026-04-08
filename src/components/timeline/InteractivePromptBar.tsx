import { useState, useEffect, useCallback, memo } from "react"
import { useSessionContext, useSessionChatContext } from "@/contexts/SessionContext"
import { useIsMobile } from "@/hooks/useIsMobile"
import { PlanApprovalBar } from "@/components/ChatInput/PlanApprovalBar"
import { UserQuestionBar } from "@/components/ChatInput/UserQuestionBar"

/**
 * Renders interactive prompt UI (plan approval / user questions) at the bottom
 * of the conversation pane on desktop. On mobile, ChatInput already handles this.
 */
export const InteractivePromptBar = memo(function InteractivePromptBar() {
  const { pendingInteraction } = useSessionContext()
  const { chat: { sendMessage } } = useSessionChatContext()
  const isMobile = useIsMobile()
  const [disabled, setDisabled] = useState(false)

  // Reset disabled state when the interaction is resolved
  useEffect(() => {
    if (!pendingInteraction) {
      setDisabled(false)
    }
  }, [pendingInteraction])

  const handleSend = useCallback((text: string) => {
    setDisabled(true)
    sendMessage(text)
  }, [sendMessage])

  const handleApprove = useCallback(() => {
    setDisabled(true)
    sendMessage("yes")
  }, [sendMessage])

  // Don't render on mobile (ChatInput handles it) or when there's no interaction
  if (isMobile || !pendingInteraction) return null

  return (
    <div className="shrink-0 border-t border-border/30 bg-elevation-1 px-4 py-2">
      <div className="mx-auto max-w-3xl">
        {pendingInteraction.type === "plan" && (
          <PlanApprovalBar
            allowedPrompts={pendingInteraction.allowedPrompts}
            onApprove={handleApprove}
            onSend={handleSend}
            disabled={disabled}
          />
        )}
        {pendingInteraction.type === "question" && (
          <UserQuestionBar
            questions={pendingInteraction.questions}
            onSend={handleSend}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
})
