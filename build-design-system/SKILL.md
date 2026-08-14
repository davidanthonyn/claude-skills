---
name: build-design-system
description: Create a complete design system for frontend project. Use when creating UI or when user ask "Create/update the design system"
---

Only use if the repo is Frontend repo.

Create a design systems for the project that contains :
1. Design Tokens
  - Color Palette: Core brand colors, semantic colors (Success, Error, Warning), and neutral scales (Greys).
  - Typography: Font families, font sizes (using a modular scale), line heights, and weights.
  - Spacing & Sizing: A defined scale (e.g., 4px or 8px base) to maintain vertical and horizontal rhythm.
  - Elevation & Shadows: Defined levels of depth (Z-index and Box-shadows).
  - Border Radius: Standardized corner rounding for UI consistency.
2. Foundations
  - Grid & Layout: Definition of containers, breakpoints (Mobile, Tablet, Desktop), and column systems.
  - Iconography: A unified set of SVG icons with consistent stroke weights and bounding boxes.
  - Global Reset: A CSS Reset or Normalize layer to ensure cross-browser styling consistency (not needed for TailwindCSS)
3. The Component Library : Follow Atomic Design, grouping component by complexity
  - Atoms (e.g. Button, Input, Label, Heading, Text, Loader, Checkbox, Badges, etc.)
  - Molecules (e.g. Search bars, Form Group, Toast Notifications, Alert, etc.)
  - Organisms (e.g Navigation bars, Sidebars, Data tables, Card grids, Modal, etc.)

If there is any component exists, confirm to user about how to deal with it.
The design systems must be consistence, extendable styles/classes, aesthetic and not looks like AI generated UI.

Avoid this :
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Do this instead :
- Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
- Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
- Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
- Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.
- Prioritized Accessibility to follow a11y standards : Color & Contrast, Typography & Readibility, Keyboard Navigation, Semantic HTML & ARIA roles, touch target for mobile.0
- use Composition pattern, avoid too much props
