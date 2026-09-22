import node from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: '..',
	css: { postcss: { plugins: [] } },
	server: { port: 5173, strictPort: true },
	plugins: [
		tailwindcss(),
		sveltekit({
			env: { dir: '..' },
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: process.env.VERCEL ? vercel() : node()
		})
	]
});
