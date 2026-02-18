# Conversations UI Redesign

**Date:** 2026-02-18
**Status:** Approved
**Scope:** Dashboard Conversations tab — CSS + JS only, no backend changes

## Goals

1. Transform the empty state "No conversations yet" into a persistent tip bar
2. Add full datetime (date + time) to each conversation
3. Add filter bar: direction chips + agent dropdown
4. Conversations collapsed by default, expand in-place (accordion)
5. Modern, sleek look inspired by SLDS2 and Dribbble chat UIs

## Approach

CSS-only redesign + minimal JS additions. No new dependencies, no framework migration.
Keep vanilla HTML/JS/CSS stack. Don't touch backend, SSE, Agents tab, or Setup Wizard.

## Components

### Filter Bar
- Direction toggle chips: All | ↙ Inbound | ↗ Outbound
- Agent dropdown: dynamically populated from seen agents
- Client-side filtering on the conversations Map

### Conversation Cards (Accordion)
- Collapsed (default): chevron ▸, direction badge, agents, message count, full datetime
- Expanded: chevron ▾, messages slide down with animation
- Datetime: HH:MM bold + MMM DD, YYYY in secondary color

### Tip Bar (replaces empty state)
- Small banner at bottom: "💡 Tip: Send messages via POST /a2a..."
- Clickable to expand and show curl example
- Always visible, not just when empty

### Date Grouping
- Day separators: "Today" / "Yesterday" / "Feb 16, 2026"

### Style
- SLDS2-inspired: 12px border-radius, subtle shadows, generous spacing
- Keep Apple font stack and current color palette
- Hover lift on cards, 200ms transitions
- Colored direction badges (blue inbound, green outbound)

## Files Modified

| File | Change |
|------|--------|
| `public/dashboard.html` | Add filter bar, restructure empty state, update thread structure |
| `public/css/dashboard.css` | New card design, filter chips, accordion, tip bar, date separators |
| `public/js/monitor.js` | Collapsed default, filter logic, datetime formatting, agent dropdown |

## Not Modified

- Backend routes, SSE, EventBus, EventStore
- Agents tab, Setup Wizard tab, Login page
- Any TypeScript source files
