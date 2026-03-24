import React from "react"
import { motion } from "framer-motion"
import { listContainerVariants, listItemVariants, panelVariants } from "../../lib/motion"
import { QUEUE_SHORTCUTS } from "./shortcuts"

type QueueHelpPanelProps = {
  compact?: boolean
}

const QueueHelpPanel: React.FC<QueueHelpPanelProps> = ({ compact = false }) => {
  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="liquid-glass chat-container aura-strong p-0 flex flex-col overflow-hidden flex-1 min-h-0"
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="vortex-watermark" />
      <div className={compact ? "flex-1 overflow-y-auto px-3 py-3" : "flex-1 overflow-y-auto px-4 py-3"}>
        <h3 className="font-semibold text-[var(--text-primary)] mb-3 text-[14px]">Keyboard Shortcuts</h3>
        <motion.div
          variants={listContainerVariants}
          initial="initial"
          animate="animate"
          className="space-y-2.5"
        >
          {QUEUE_SHORTCUTS.map(({ label, keys, desc }) => (
            <motion.div key={label} variants={listItemVariants} className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-[12px] text-[var(--text-primary)]">{label}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{desc}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0 mt-0.5" aria-hidden="true">
                {keys.map((k) => (
                  <span key={k} className="kbd-key">
                    {k}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}

export default QueueHelpPanel
