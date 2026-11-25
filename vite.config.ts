import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: true,
		port: 5040
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
