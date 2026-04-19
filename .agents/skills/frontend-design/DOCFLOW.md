# DocFlow Design Guide

DocFlow is not a marketing landing page. It is an editorial product workspace for people reviewing structured product documents, reference material, timelines, and relationships between artifacts.

Use the base `frontend-design` skill for ambition and polish, then constrain it with the rules below.

## Core Direction

- Aesthetic: luxury editorial dashboard
- Mood: precise, quiet, premium, information-dense
- First impression: a design review desk, not a startup toy
- Primary goal: make dense information feel ordered and calm

## Visual Language

- Backgrounds should stay light and mostly white
- Use warm neutrals, charcoal ink, and restrained brass accents
- Prefer paper, panel, and line contrast over loud gradients
- Shadows should be soft and wide, never muddy or neon
- Decorative effects must support hierarchy, not fight it

## Typography

- Use `var(--font-display)` for major titles, section labels, and graph framing text
- Use `var(--font-editorial)` or the base sans stack for body content
- Display text must be tightly controlled; do not let headlines overflow cards or hubs
- Long Korean service names must be truncated or wrapped intentionally
- Body text must prioritize readability over style

## Product Constraints

- Information always wins over ornament
- Every card, hub, modal, or panel must contain its text cleanly at common viewport widths
- Avoid overflow in graph nodes, service hubs, pill labels, and sticky toolbars
- Use color coding to clarify status, not to decorate everything
- Dense list views should remain readable and easy to scan

## Component Rules

- Cards: refined surfaces, visible hierarchy, restrained color, strong spacing rhythm
- Filters and controls: compact, tactile, premium, with clear active states
- Modals: editorial detail panels with readable long-form text
- Graphs: paper-light backgrounds, thin lines, compact labels, strong information rails
- Empty states: elegant and calm, not playful

## Avoid

- Emoji-first UI treatments
- Loud blur blobs or generic AI gradients
- Oversized condensed headings that break containment
- Purple-heavy palettes or synthetic neon color stories
- Excessively rounded, toy-like controls unless the surrounding layout supports it
