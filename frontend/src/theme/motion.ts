// Spring configs reused across every animation. Linear easing is banned —
// every transition uses one of these springs so motion feels physical and
// consistent across the app.

export const springs = {
  // Default for buttons, chips, list items — snappy and responsive.
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  // For bottom sheets and drawers — heavier, weighted feel.
  drawer: { damping: 28, stiffness: 280, mass: 1.2 },
  // For cart badge bounce — exaggerated, celebratory.
  bounce: { damping: 10, stiffness: 400, mass: 0.6 },
  // For modal entry — smooth and confident.
  modal: { damping: 32, stiffness: 260, mass: 1.0 },
} as const;

export type SpringName = keyof typeof springs;
