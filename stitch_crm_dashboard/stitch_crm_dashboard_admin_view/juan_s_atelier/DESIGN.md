# Design System Strategy: Lo de Juan Visual Identity

## 1. Overview & Creative North Star
**The Creative North Star: "The Playful Minimalist"**

This design system is built at the intersection of high-end Apple-inspired precision and the vibrant, human-centric energy of the "Lo de Juan" identity. It moves beyond the clinical coldness of standard tech interfaces by infusing curated color pops and soft, organic layering. 

We reject the "flat" web. Instead, we embrace **Soft Editorial Minimalism**. The interface should feel like a premium physical magazine—spacious, intentional, and tactile. We achieve this through asymmetrical layouts that break the standard 12-column grid, generous use of `surface_container` tokens to create depth, and a typography-first approach that prioritizes negative space over structural borders.

---

## 2. Colors & Surface Philosophy

The palette translates the primary hues of the logo (Red, Yellow, Blue, Green) into sophisticated, functional UI tokens. We treat color as a high-value currency: used sparingly to guide the eye, never to overwhelm.

### The "No-Line" Rule
**Explicit Instruction:** Solid 1px borders are prohibited for sectioning or defining UI boundaries. 
*   **The Technique:** Define sections through background shifts. Place a `surface_container_low` section directly against a `surface` background. The transition in tone is sufficient to define the edge, creating a cleaner, more "Apple-like" aesthetic.

### Surface Hierarchy & Nesting
Think of the UI as layers of frosted glass.
*   **Base:** `surface` (#f8f9fa) is the canvas.
*   **Sub-sections:** Use `surface_container` (#edeeef) for content blocks.
*   **Emphasis Elements:** Use `surface_container_highest` (#e1e3e4) for floating elements that require the most attention.

### The "Glass & Gradient" Rule
To elevate the "Lo de Juan" brand, utilize **Glassmorphism** for navigation bars and floating action buttons. Use `surface_container_lowest` at 70% opacity with a `backdrop-blur` of 20px. 
*   **Signature Textures:** For primary actions, move beyond flat red. Apply a subtle linear gradient from `primary` (#b7102a) to `primary_container` (#db313f) at a 135-degree angle. This adds "visual soul" and a three-dimensional quality to touchpoints.

---

## 3. Typography: The Manrope Scale

We use **Manrope** for its geometric clarity and modern warmth. It bridges the gap between the playful handwritten logo and a premium digital experience.

*   **Display (lg/md/sm):** Used for "hero" moments. Use `on_surface` color with `-0.02em` letter spacing to feel tight and professional.
*   **Headlines & Titles:** These convey authority. Maintain ample `spacing_16` above headlines to let the editorial message breathe.
*   **Body (lg/md):** Our workhorse. Use `on_surface_variant` (#414755) for long-form text to reduce eye strain, reserving the pure `on_surface` for high-priority labels.
*   **Labels:** Always uppercase with `+0.05em` tracking when used for category headers to create a "curated" feel.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering**, not lines. 
*   *Example:* A card using `surface_container_lowest` (#ffffff) sitting on a `surface_container_low` (#f3f4f5) background creates a natural, soft lift.

### Ambient Shadows
Shadows must mimic natural light. Use a multi-layered shadow approach:
*   **Blur:** 24px - 40px.
*   **Opacity:** 4% - 6%.
*   **Tint:** Use a tiny fraction of `on_surface` in the shadow hex to ensure it feels integrated into the background rather than a "grey smudge."

### The "Ghost Border" Fallback
If accessibility requirements demand a container edge, use a **Ghost Border**: `outline_variant` (#c1c6d7) at **15% opacity**. This provides a hint of a boundary without breaking the minimalist flow.

---

## 5. Components

### Buttons & Chips
*   **Primary Button:** Gradient-filled (Primary to Primary Container), `rounded-full`, with `body-lg` bold typography.
*   **Selection Chips:** Use `secondary_container` (#bbd3fd) for the selected state and `surface_container_high` for the unselected state. Use `rounded_lg` (1rem) for a friendly, modern feel.

### Input Fields
*   **Style:** No bottom line. Use a `surface_container_low` background with `rounded_md` (0.75rem). 
*   **States:** On focus, transition the background to `surface_container_lowest` and apply a 2px "Ghost Border" using the `primary` color at 30% opacity.

### Cards & Lists
*   **Anti-Divider Policy:** Never use horizontal rules (`<hr>`). Separate list items using `spacing_4` (1.4rem) of vertical white space or by alternating very subtle background tints between `surface` and `surface_container_low`.
*   **Rounding:** All cards must use `rounded_xl` (1.5rem) to align with the "Apple" aesthetic of soft, friendly containers.

### Innovative Component: The "Brand Dot" Scroll Progress
Inspired by the "Lo de Juan" logo, use the four brand colors (Red, Yellow, Blue, Green) as small, glassmorphic dots in the corner of the screen that animate or illuminate as the user scrolls through different content sections.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical margins. If the left margin is `spacing_8`, try a right margin of `spacing_12` for editorial layouts.
*   **Do** lean into white space. If you think there is enough room, add `spacing_2` more.
*   **Do** use the `tertiary` (yellow/gold) tokens for "Premium" or "Loyalty" features to signify value.

### Don’t
*   **Don’t** use pure black (#000000) for text. Use `on_surface` (#191c1d) to maintain a high-end, softer contrast.
*   **Don’t** use default Material shadows. They are too heavy for this aesthetic.
*   **Don’t** cram icons and text together. Use at least `spacing_2` (0.7rem) of internal padding between elements within a component.