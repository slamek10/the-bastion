# Work orders: The Bastion ↔ the orchestrator session

You ask a robot in The Bastion for a change in the code ("Thermal Sentinel: show the boiler flow temperature on the room cards"). It becomes a **work order**. The orchestrator session on the Mac (`/Users/islamek/bastion`) picks it up, plans it, and posts the plan. Nothing is coded until you press **Approve** in the HUD. Then the orchestrator sends the brief to the app's session, which codes, commits, pushes and hands back `ready to ship`. The orchestrator ships it and reports every step back to the order. The robots act it out: the Orchestrator walks to the app's robot when the brief goes out, the app's robot works while its app is coded, the Orchestrator works while it ships.

```
 you (HUD) ── file ──▶ new ──▶ planning ──▶ awaiting_approval ──▶ approved ──▶ coding ──▶ ready ──▶ shipping ──▶ deployed
                                  ▲   (orchestrator)    │  you: Approve        (orchestrator: brief → app session → commit)   rolled_back / failed
                                  └── you: Ask for changes (feedback)
                                       you: Reject → rejected     you: Cancel (any time before done) → cancelled
```

Only you can approve, ask for changes, reject or cancel. The orchestrator's token can't approve, and the plan can't be changed after you approve it (a different plan needs a new order).

## Access

`ORDERS_TOKEN` (32+ characters, `openssl rand -hex 32`) in The Bastion's `.env` on the server and on the Mac (for example in `~/.bastion/orders-token`, read into `$ORDERS_TOKEN`). Every call sends `Authorization: Bearer $ORDERS_TOKEN`. Base URL: `http://192.168.10.12:5040`.

## Watching for work

```sh
curl -sN -H "Authorization: Bearer $ORDERS_TOKEN" http://192.168.10.12:5040/orders/events \
  | grep --line-buffered '^data:'
```

As a Claude Code `Monitor` (30 minutes at most, re-arm when it expires). On connect it sends every order that waits on the orchestrator, then one line for each change to any order:

```json
{
	"id": "k3x9a1m2qz",
	"status": "new",
	"action": "plan",
	"repos": ["bastion-heat"],
	"request": "…",
	"feedback": "…"
}
```

`action` says what to do: `plan` (a new order), `replan` (you asked for changes: `feedback` says what), `build` (you approved). `null`: nothing to do, it's waiting on you or it's only a status line.

## Reading and reporting

```sh
B=http://192.168.10.12:5040; H="Authorization: Bearer $ORDERS_TOKEN"
curl -s -H "$H" "$B/orders?action=1"        # orders waiting on the orchestrator
curl -s -H "$H" "$B/orders?open=1"          # every open order
curl -s -H "$H" "$B/orders/<id>"            # one order in full: request, plan, feedback, commits, log
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$B/orders/<id>" -d '{"status":"planning"}'
```

`POST /orders/<id>` takes `{ status?, text?, plan?, apps?, commit? }`. Without `status` it only adds `text` to the order's log (progress notes are shown in the HUD).

| Step                              | Body                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Start planning                    | `{"status":"planning"}`                                                                                                 |
| Post the plan                     | `{"status":"awaiting_approval","plan":"<markdown: one brief per app, which goes first>","apps":["heat"]}`               |
| A better plan before you answer   | `{"status":"planning"}`, then post the plan again                                                                       |
| Brief sent to the app session     | `{"status":"coding","text":"Brief sent to bastion-heat"}`                                                               |
| Hand-off came back                | `{"status":"ready","commit":{"app":"heat","branch":"main","commit":"<sha>","summary":"…"}}` (one call per app)          |
| Deploying                         | `{"status":"shipping"}`                                                                                                 |
| Result                            | `{"status":"deployed"}`, `{"status":"rolled_back","text":"<cause>"}` or `{"status":"failed","text":"<step and error>"}` |
| A fix after a rollback or failure | `{"status":"coding"}` again (same approved plan)                                                                        |

`apps` are `ha`, `ai`, `heat`, `cams`, `watch`, `bastion` (the-bastion). A wrong move answers `409` with the reason.

## What the orchestrator does with an order

1. **plan / replan:** read the order (`GET /orders/<id>`), read the app's code as for any change, and post the plan: the brief(s) it would send, in the CLAUDE.md format (Goal, Changes, Acceptance, Out of scope, Server needs). The plan you approve is the brief that gets sent.
2. **build:** send each brief to its app session (`SendMessage`, or ask the user to paste it if that session isn't listed), and report `coding`.
3. On `ready to ship: <app> <branch> <commit> — …`: report `ready` with the commit, then ship as CLAUDE.md says (`shipping`, then `deployed` / `rolled_back` / `failed`), and send the push notification as usual.
