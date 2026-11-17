# UI Theme Steering — Cryptex3D

This document is active steering for the Kiro agent. Enforce these constraints on every UI component, layout, and styling decision.

## Aesthetic Identity: "Haunted Cyber-Vault"

Cryptex3D is a **dark-mode glassmorphic HUD**. The visual language combines a deep-space observatory with a haunted Victorian vault — precise, atmospheric, and slightly unsettling. Every UI element reinforces the feeling that you are interfacing with something powerful and secret.

## Color System

| Role | Value | Usage |
|---|---|---|
| Void background | `#060810` | Root background, scene backdrop |
| Surface glass | `rgba(12, 18, 35, 0.72)` | Panel backgrounds (backdrop-blur) |
| Border glow | `rgba(99, 102, 241, 0.35)` | Panel borders, default |
| Accent indigo | `#6366f1` | Primary interactive elements |
| Accent emerald | `#10b981` | Success states, payload verified |
| Accent crimson | `#ef4444` | Error states, audit warnings |
| Accent amber | `#f59e0b` | Caution states, partial results |
| Ghost text | `rgba(226, 232, 240, 0.55)` | Secondary labels, placeholders |
| Active text | `#e2e8f0` | Primary readable content |

### Glow Effects
- Interactive artifact hover: `box-shadow: 0 0 24px rgba(99, 102, 241, 0.6)` (indigo outer glow).
- Cryptex ring active segment: `0 0 16px rgba(16, 185, 129, 0.8)` (emerald pulse).
- Error / audit alert: `0 0 20px rgba(239, 68, 68, 0.7)` (crimson flare).
- Glow animations use CSS `@keyframes` with `opacity` and `filter: blur()` only — no layout-triggering properties.

## Typography

- **Font stack**: `'Inter Variable', 'JetBrains Mono', system-ui, sans-serif`.
- **Monospace** (`JetBrains Mono`): all payload text, hex values, checksums, SDP offer/answer strings, error codes.
- **Sans-serif** (`Inter Variable`): HUD labels, panel headings, button text.
- Minimum body text size: `14px` / `0.875rem`.
- Heading scale: `text-xs` → `text-sm` → `text-base` → `text-lg`; nothing larger in the HUD layer (the 3D scene provides visual mass).
- Letter-spacing on uppercase labels: `tracking-widest` (`0.1em`).
- No decorative fonts, serif, or handwriting styles.

## Layout

- **Single-page fullscreen**: the Three.js canvas fills 100vw × 100vh at all times.
- **HUD overlay**: all React panels float as absolutely positioned glassmorphic overlays above the canvas.
- **Panel anatomy**: `backdrop-filter: blur(16px)`, `border: 1px solid <border-glow>`, `border-radius: 12px`, `padding: 16px 20px`.
- Panels must not occlude more than 40% of the canvas at any time (default collapsed state).
- All panels are collapsible; collapsed state shows only an icon + label strip.

## Component Rules

### Buttons
- Primary: filled indigo (`bg-indigo-500`), white text, subtle glow on hover.
- Secondary: glass border only (`border-indigo-500/40`), indigo text.
- Destructive: crimson border + text.
- Size: minimum `h-9 px-4`, touch target ≥ 44px.
- No rounded-full pill shapes — use `rounded-lg` (8px) for a precise, technical feel.
- No gradient fills on buttons; flat color only.

### Icons
- Use Lucide React icon set exclusively for consistency.
- Size: `16px` inline, `20px` standalone.
- Color inherits from parent text; no independent icon colors except status indicators.

### Inputs & Textareas
- Background: `rgba(6, 8, 16, 0.8)`.
- Border: `1px solid rgba(99, 102, 241, 0.3)`; focus: `rgba(99, 102, 241, 0.7)`.
- Passphrase input: always `type="password"`, monospace font, no browser autofill styling override.
- SDP textarea: monospace, `rows=6`, `resize-y` only.

### Forbidden UI Patterns
- No colorful gradient hero sections.
- No floating emoji decorations.
- No animated skeleton loaders with bright colors.
- No card grids with drop shadows on white backgrounds.
- No progress spinners with rainbow colors.
- No "fun" or playful micro-copy — all text is precise and functional.
- No comic sans, papyrus, or display fonts.
- No light-mode variant — this application is dark-mode only.
