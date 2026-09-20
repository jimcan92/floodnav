import tailwindcss from '@tailwindcss/vite';
import vercel from '@sveltejs/adapter-vercel';
import node from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: '..',
	css: { postcss: { plugins: [] } },
	server: { port: 3000, strictPort: true },
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
