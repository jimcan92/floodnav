# Frontend structure

- `client/src/lib/components/demo/`: main map page, directions, scenario editor, notifications, and journey controls.
- `client/src/lib/components/research/`: research planner, flood sources, route choices, progress, and dialogs. The route composes these around one `createResearchState()` instance.
- `client/src/lib/states/demo/`: reactive data, derived selectors, GPS, playback, routing, rainfall, shared conditions, and lifecycle. `demo.svelte.ts` is the public entrypoint; read derived values through `navigation` getters without destructuring them.
- `client/src/lib/states/research/`: per-page trip state and request binders. Call the factory during component initialization so Svelte owns its effects and cleanup.
- `client/src/lib/states/floods.svelte.ts`: canonical observed-flood state and fetch lifecycle.
- `client/src/lib/utils/`: pure helpers and the Leaflet/Lucide marker adapter. Destroy mounted marker glyphs when their layer or map is removed.

Use DaisyUI components and semantic theme colors, with Tailwind utilities for layout. The global stylesheet only configures Tailwind and DaisyUI. Leaflet's vendor CSS, its runtime positioning, geographic overlay colors, and the measured mobile viewport height are intentional exceptions. All UI glyphs use the typed Lucide mapping in `utils/icons.ts`.

Keep DOM references and form drafts in their owning components. State modules must not import the public demo entrypoint; use the core state and specific dependencies to avoid cycles. Cleanup functions must abort obsolete requests, stop polling, and release GPS watches. Session/generation checks protect a remounted page from late responses.

Verification: `pnpm check`, `pnpm test`, and `pnpm build`. Browser tests were intentionally not run for this refactor at the user's request. Manual testing should cover mobile panel focus, keyboard resizing, map picking, GPS and playback, scenario draft conflicts, research dialogs, theme switching, and offline/PWA behavior.
