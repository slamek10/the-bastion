import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { sharedFromHeader, validShared } from './bastion-session.js';

const { handler } = await import('./build/handler.js');

const app = express();
const PORT = process.env.PORT || 5040;
const HASS_URL = (process.env.HASS_URL || '').replace(/\/$/, '');

app.disable('x-powered-by');

/*
 * Live camera streams: /_api/camera/stream asks Home Assistant for an HLS
 * stream and hands the browser /hls/api/hls/<token>/…, which is proxied
 * here to HA. Same origin, so no mixed content, and HA's token stays on the
 * server (the URL carries only HA's own short-lived stream token).
 */
if (HASS_URL) {
	const proxy = createProxyMiddleware({
		target: HASS_URL,
		changeOrigin: true,
		pathFilter: (path) => path.startsWith('/hls/api/hls/'),
		pathRewrite: (path) => path.replace(/^\/hls/, '')
	});
	app.use('/hls/', (req, res, next) => {
		if (!validShared(sharedFromHeader(req.headers.cookie))) {
			res.status(401).end('Unauthorized');
			return;
		}
		next();
	});
	app.use(proxy);
}

// SvelteKit does everything else
app.use(handler);

app.listen(PORT, () => console.log('the-bastion on port', PORT));
