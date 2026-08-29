# Game Plugin Contract

This is the one convention Core depends on. Follow it and a new game needs
**zero** changes anywhere in `backend/src/` — not in the API routes, not in
matchmaking, not in the WebSocket layer, not in the frontend's data model.

## Folder layout

```
games/<id>/
  manifest.json   — required
  engine.js       — required
  README.md       — optional, recommended for house-rule notes
```

`<id>` (the folder name) is the game's permanent identifier. It shows up in
`Match.gameId`, in URLs, in the frontend's game registry map — don't rename
it once real matches reference it.

## manifest.json

```jsonc
{
  "id": "chess",                     // MUST equal the folder name
  "name": "Chess",
  "persianName": "شطرنج",
  "icon": "♟️",
  "description": "توضیح کامل برای صفحه انتخاب بازی",
  "version": "1.0.0",
  "minPlayers": 2,
  "maxPlayers": 2,
  "defaultRandomPlayers": 2,          // how many players a random-queue match needs
  "supportedModes": ["random", "friend"],
  "supportedTypes": ["free", "staked"],
  "engine": "engine.js",              // relative path within this folder
  "frontendEntry": "chess",           // key the frontend registry maps to a React component
  "theme": { "primary": "#...", "accent": "#..." },
  "turnTimeoutSeconds": 30
}
```

The registry (`backend/src/games/registry.js`) validates every required
field at server startup and refuses to boot with a malformed manifest —
loudly, not silently skipping it.

## engine.js

Export a class (any name — the registry takes whichever class the module
exports). It must implement:

```js
class MyGameEngine {
  constructor(matchConfig) { /* { matchId, type, stake, players, rng? } */ }

  getInitialState() { /* -> plain JSON-serializable object */ }

  validateAction(state, userId, action) { /* -> { valid, error? }, no side effects */ }

  applyAction(state, userId, action) {
    /* -> { state, events, finished, winnerId, draw, result } */
  }

  // Optional but recommended:
  viewFor(state, userId) { /* hide secret info from this player; default: identity */ }
  getAwaitedUserId(state) { /* whose action are we waiting on? enables turn timeouts */ }
  onTimeout(state, userId) { /* same return shape as applyAction */ }
  onPlayerDisconnect(state, userId) { /* -> new state */ }
}

module.exports = { MyGameEngine };
```

Rules for a well-behaved engine:

- **Never trust the client for anything that decides money or a winner.**
  Dice, hidden choices, and turn order are computed here, server-side, from
  `this.rng` (injectable for deterministic tests) — never from a value the
  client sends.
- **Pure functions.** `applyAction` must be a pure function of
  `(state, userId, action)` — no `Date.now()`-based game logic, no network
  calls, no mutation of the `state` argument (return a new object; the
  reference implementations use `structuredClone`).
- **JSON-serializable state only.** It's persisted to `Match.gameState`
  (a Postgres `Json` column) as-is between every action.
- **Don't import anything from `backend/src/`.** A game plugin should be
  understandable — and testable — in complete isolation. See
  `backend/tests/unit/ludo.test.js` for the pattern: require the engine
  directly, inject a scripted `rng`, assert on state transitions.

## What Core actually does with this

1. At startup, `registry.discoverGames()` scans `games/`, reads every
   manifest, `require()`s the engine file, and checks the class has the
   required methods. Nothing here is game-specific.
2. `GET /api/games` returns every manifest — the frontend's Game tab is
   built entirely from this list.
3. `MatchSession` (`backend/src/realtime/MatchSession.js`) calls
   `getInitialState`, `validateAction`, `applyAction`, `viewFor`,
   `getAwaitedUserId`, and `onTimeout` — never anything game-specific.
4. Economy and score payouts happen in `MatchSession._finishMatch`, driven
   purely by `type`/`mode` (free/staked, random/friend) — not by which game
   was played.

## Adding "chess" end to end

1. `games/chess/manifest.json` + `games/chess/engine.js` (backend — done,
   auto-discovered on next deploy, no other backend file touched).
2. `frontend/src/games/chess/ChessBoard.jsx` + one line in
   `frontend/src/games/registry.js` mapping `frontendEntry: "chess"` to that
   component. This is the one frontend touch-point — everything else
   (Game tab list, matchmaking, friend invites, economy, leaderboard) already
   works for any `gameId` it hasn't seen before.
