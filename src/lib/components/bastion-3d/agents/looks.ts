/** how each villager looks: body, skin, hair, outfit colours, accessories, height (m) */
import type { AgentId } from '$lib/types';

export type Accessory = 'tie' | 'hood' | 'cap' | 'apron' | 'binoculars' | 'scarf';

export interface Look {
	body: 'male' | 'female';
	skin: 'dark' | 'light';
	/** tints the skin texture a little, for more variety */
	skinTint: number;
	/** hairstyle node names in hair.glb */
	hair: string[];
	hairColor: number;
	shirt: number;
	trousers: number;
	shoes: number;
	/** the agent's colour: the badge on its chest */
	accent: number;
	accessories: Accessory[];
	height: number;
}

export const LOOKS: Record<AgentId, Look> = {
	orchestrator: {
		body: 'male',
		skin: 'light',
		skinTint: 0xfff4ea,
		hair: ['Hair_SimpleParted'],
		hairColor: 0x6b4a32,
		shirt: 0x26365a,
		trousers: 0x1d2536,
		shoes: 0x1b1b1f,
		accent: 0xa78bfa,
		accessories: ['tie'],
		height: 1.8
	},
	watchdog: {
		body: 'male',
		skin: 'dark',
		skinTint: 0xffffff,
		hair: ['Hair_Buzzed', 'Hair_Beard'],
		hairColor: 0x2a211b,
		shirt: 0x3d4a3a,
		trousers: 0x34506e,
		shoes: 0xe8e4dc,
		accent: 0xf59e0b,
		accessories: ['hood'],
		height: 1.78
	},
	thermal: {
		body: 'male',
		skin: 'light',
		skinTint: 0xffe2cc,
		hair: ['Hair_Buzzed'],
		hairColor: 0xb3622c,
		shirt: 0xd9692a,
		trousers: 0xc75a20,
		shoes: 0x5a3b22,
		accent: 0xf97316,
		accessories: ['cap'],
		height: 1.74
	},
	homekeeper: {
		body: 'female',
		skin: 'dark',
		skinTint: 0xffffff,
		hair: ['Hair_Buns'],
		hairColor: 0x221a16,
		shirt: 0x2f8f8a,
		trousers: 0x5b4636,
		shoes: 0x3a2a20,
		accent: 0x22d3ee,
		accessories: ['apron'],
		height: 1.66
	},
	vision: {
		body: 'female',
		skin: 'light',
		skinTint: 0xfff0e6,
		hair: ['Hair_Long'],
		hairColor: 0xd9b26a,
		shirt: 0x5d6b3a,
		trousers: 0x2d3a4a,
		shoes: 0x3b2a1e,
		accent: 0xef4444,
		accessories: ['binoculars', 'scarf'],
		height: 1.7
	}
};
