# Market Simulator

A self-contained demo application that simulates a live market server and a WebSocket-driven client UI.

This repository implements a real-time accelerated market simulation (1 real second = 1 simulated day), multiple simulated stock profiles, multi-client support, and a responsive three-panel GUI for demonstrating trading behavior.

**Quick Start**

Prerequisites: Node.js (recommend v20+).

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm start
# Open http://localhost:3000 in your browser
```

You can change the listening port via `PORT`, for example:

```bash
PORT=4000 npm start
```

**What’s implemented**

- **Server-side simulation**: stochastic price evolution with three seeded profiles (index-like, volatile tech, penny stock).
- **Accelerated time model**: 1 real second = 1 simulated trading day.
- **Multi-client WebSocket sync**: real-time market ticks, stock updates, trade feed, and account updates are broadcast to all connected clients.
- **In-memory accounts & sessions**: demo registration/login (salted+scrypt password hash in memory) with no persistence between restarts.
- **Market orders only**: immediate execution at current server price with buy/sell validation and small market-impact adjustments.
- **Deterministic collision handling**: if two trades arrive at the exact same server timestamp, the server accepts one and rejects the other with a deterministic reason code.
- **Client GUI**: three-panel layout (left auth/account, center chart+trade, right stats+live feed) with a hacker-like dark green theme.

**Open the PRD**: design and acceptance criteria are in [PRD.md](PRD.md).

**Project layout (important files)**

- Server entry: [src/server/index.js](src/server/index.js)
- In-memory domain model: [src/server/state.js](src/server/state.js)
- Simulation logic: [src/server/simulation.js](src/server/simulation.js)
- Seed stock & config: [src/server/config.js](src/server/config.js)
- WebSocket protocol helpers: [src/server/protocol.js](src/server/protocol.js)
- Frontend: [public/index.html](public/index.html), [public/styles.css](public/styles.css), [public/app.js](public/app.js)
- Architecture reference: [docs/server-architecture.md](docs/server-architecture.md)

**WebSocket API (summary)**

Client -> Server action envelope (JSON):

```json
{
	"type": "action_name",
	"requestId": "optional-client-id",
	"payload": { /* action specific */ }
}
```

Supported client actions:

- `register` — payload: { username, password }
- `login` — payload: { username, password }
- `logout` — payload: {}
- `place_order` — payload: { symbol, side: "buy"|"sell", quantity }
- `get_snapshot` — payload: {}

Server -> Client event envelope (JSON):

```json
{
	"type": "event_name",
	"requestId": "echoed-if-request-response",
	"payload": { /* event data */ },
	"emittedAtMs": 1234567890
}
```

Key server events:

- `snapshot` — initial snapshot on connect/reconnect (includes stocks, trade feed, optional account)
- `market_tick` / `stocks_updated` — periodic tick with updated stock prices
- `trade_feed_update` — published when any client trade is accepted
- `trade_accepted` / `trade_rejected` — immediate response to a trade action
- `account_updated` — updated account summary for affected user
- `error` — error responses with `code` and `message`

**Data model (high-level)**

- Account: username, salted password hash, cash balance, holdings map, createdAtMs
- Stock: symbol, name, current price, price history, YTD open price, all-time high, total volume, simulation profile
- Trade Event: id, receivedAtMs, username, symbol, side, quantity, executedPrice (accepted), status, rejection reason (rejected)

These entities are implemented in [src/server/state.js](src/server/state.js).

**Trade semantics & collision behavior**

- Orders are market orders only and execute immediately against the current server price.
- Buys validate available cash; sells validate holdings.
- If two trades are accepted with the identical server receive timestamp, the server will accept the first and reject the later with `TRADE_COLLISION` as described in [docs/server-architecture.md](docs/server-architecture.md).

**Configuration & tuning**

- Most simulation and UI tuning values live in [src/server/config.js](src/server/config.js) (initial prices, volatility, spike rates, tick interval).

**Security & persistence notes**

- This demo uses in-memory salted+scrypt password hashing and random session tokens, but it is not designed for production use. There is no persistent DB — all state resets on server restart.
- For demo deployments consider running behind an HTTPS reverse proxy and adding persistent storage if you need durable accounts.

**Troubleshooting**

- If the server fails to start, confirm Node.js version and that the chosen `PORT` is free.
- If the UI does not connect, open the browser console to inspect WebSocket connection errors and ensure the server is reachable at the same host/port.

**Development notes & next steps**

- To modify stock behavior tune [src/server/simulation.js](src/server/simulation.js).
- To extend the protocol add actions in [src/server/protocol.js](src/server/protocol.js) and handlers in [src/server/index.js](src/server/index.js).
- Consider adding automated integration tests for `TRADE_COLLISION`, `INSUFFICIENT_FUNDS`, and concurrent trade scenarios.

If you want, I can add an end-to-end test script and a small CONTRIBUTING section next.
