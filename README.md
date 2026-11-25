# The Bastion

A 3D home and NOC command center for the Bastion apps on one server: a two-story cutaway house in Three.js where five robots stand for the five apps. They mirror live state, you can talk to each one (a real Claude agent through bastion-ai, on that app's own read-only tools), and the HUD can switch Home Assistant entities and play live cameras.

| Robot            | Room                        | App           | Tools                                                             |
| ---------------- | --------------------------- | ------------- | ----------------------------------------------------------------- |
| Watchdog         | Server bunker (annex)       | Bastion Watch | Watch's `/mcp`                                                    |
| Orchestrator     | Neural core (living room)   | bastion-ai    | this app's `/mcp`: `fleet_status`, `recent_events`                |
| Thermal Sentinel | Climate deck (utility room) | Bastion Heat  | Heat's `/mcp`                                                     |
| Home Keeper      | HA studio (upper floor)     | Bastion HA    | Bastion HA's `/mcp` (until its `/mcp/key` ships: "not available") |
| Vision Sentinel  | Watchtower + terrace        | Bastion Cams  | Cams' `/mcp`                                                      |

## How it works

```
 Watch /_api/stream ─┐
 Heat  /_api/stream ─┤  (bastion_session cookie minted
 Cams  /_api/stream ─┼── with BASTION_SESSION_SECRET)   ┌─▶ /_api/telemetry (SSE: snapshot, then diffs)
 HA /_api/voice/events┘                                 │
 Home Assistant websocket (HASS_TOKEN) ─────────── telemetry hub ─▶ /mcp fleet_status, recent_events
 bastion-ai /health ─────────────────────────────────────┘
```

- **Telemetry** (`src/lib/server/telemetry.ts`, type in `src/lib/types.ts`): containers and problems from Watch, heating from Heat, motion from Cams, voice from Bastion HA, Home Assistant entities (climate, light, cover, sensor, binary_sensor, camera, switch), and the robots' state. The browser gets a snapshot and then only what changed.
- **Robots**: a turn is `POST <BASTION_AI_URL>/v1/turn` with the robot's role, a reading key from its app (`POST <app>/mcp/key` with `BASTION_AI_TOKEN`) and the robot's last session (`data/agents.json`). One turn per robot, two at once (bastion-ai's limit); the rest show "waiting".
- **Home Assistant**: one server-side websocket. `/_api/ha/service` lets through light, cover, climate, switch, scene and script, each only for entities of that domain. Cameras: `/_api/camera/stream` asks HA for HLS, played through this app's `/hls/…` proxy (same origin, no token in the browser).
- **Bindings**: `data/bindings.json` maps each room to entity ids (the ⚙ panel in the 3D view); the first entity of a domain drives the room's object (the utility room's first `climate.*` is the thermostat, the terrace's first `light.*` the pool light).
- **Demo**: `/3d?demo` (or no `BASTION_SESSION_SECRET`) runs a local simulator with the same telemetry, with buttons for a container going down, motion, heating, a voice command and two agent turns.

## Changing the code from The Bastion

Each robot's inspector has **Change the code**: describe the change, pick the apps (the robot's own is picked already), **File**. The orchestrator session on the Mac picks the order up through `/orders` (`ORDERS_TOKEN`), plans it, and the plan comes back for you to **Approve**, **Ask for changes** or **Reject**. After approval the app's session codes it and the orchestrator ships it; every step shows on the order and the robots act it out. The protocol is in [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md). The robots' chat stays read-only: a change in the house is a HUD button, a change in the code is a work order.

## Login

The shared Bastion login: the `bastion_session` cookie of any Bastion app on the server opens this one. With `APP_PASSWORD`, the login form here makes the same cookie.

## Run

```sh
pnpm install
cp .env.example .env   # fill in what you have
pnpm dev               # http://localhost:5040
pnpm test && pnpm run check && pnpm run lint && pnpm run build
```

On the server (`/opt/the-bastion`): `docker-compose.yml` from this repo, `.env`, and `./data` as a volume. `./docker-push.sh` builds `islamek/the-bastion` for linux/amd64.

## Pages

- `/`: a flat fleet overview and the way in.
- `/3d`: the house. Leaving it disposes the whole scene; in development the console logs `renderer.info.memory` after mounting and at dispose.
