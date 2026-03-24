import type { Transition, Variants } from "framer-motion"

export const MOTION_DURATIONS = {
  fast: 0.16,
  base: 0.24,
  slow: 0.34,
} as const

export const EASE_STANDARD: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const EASE_GENTLE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

export const pageTransition: Transition = {
  duration: MOTION_DURATIONS.slow,
  ease: EASE_STANDARD,
}

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1, transition: pageTransition },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.996,
    transition: { duration: MOTION_DURATIONS.base, ease: EASE_GENTLE },
  },
}

export const panelVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.99 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATIONS.base, ease: EASE_STANDARD },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.99,
    transition: { duration: MOTION_DURATIONS.fast, ease: EASE_GENTLE },
  },
}

export const listContainerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.045,
      delayChildren: 0.04,
    },
  },
}

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATIONS.base, ease: EASE_STANDARD },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: MOTION_DURATIONS.fast, ease: EASE_GENTLE },
  },
}
