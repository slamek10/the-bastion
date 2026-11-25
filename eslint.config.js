import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		// .svelte.ts / .svelte.js use runes and need the typescript parser too
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		},
		rules: {
			// svelte components are typescript; tsc checks undefined names and
			// core no-undef false-positives on type-only DOM names like
			// RTCIceCandidateInit (typescript-eslint disables it for .ts files)
			'no-undef': 'off'
		}
	},
	{
		// data/ holds local runtime files and third-party card bundles
		ignores: ['build/', '.svelte-kit/', 'dist/', 'data/']
	},
	{
		/*
		 * Temporarily disable certain rules to mitigate
		 * unnecessary distractions during development.
		 */
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			// meant for links between SvelteKit routes; here every href is a file,
			// download or external page, and the app has a single route
			'svelte/no-navigation-without-resolve': 'off',
			// `_name` marks something unused on purpose (e.g. a key left out of a rest copy)
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			],
			'@typescript-eslint/ban-ts-comment': 'off',
			'svelte/no-at-html-tags': 'off',
			// false positive on `prop = $bindable()` destructuring, core rule doesn't understand runes
			'no-useless-assignment': 'off'
		}
	}
);
