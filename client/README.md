# FloodNav SvelteKit client

This is the active web app. Run `npm install` here, then `npm run dev`; alternatively use `npm run dev` from the repository root. See [the root README](../README.md) for Supabase, demos, tests and firmware.

Public Supabase configuration is loaded from `../.env` using `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The app can also test/save browser-local public settings through its connection form.

Local builds use adapter-node; Vercel deployment builds retain adapter-vercel. Leaflet is imported only on mount so SvelteKit server rendering does not access `window`.
