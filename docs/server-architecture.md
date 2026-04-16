# Server Architecture (Initial)

## 1. Objective

This architecture defines the initial server implementation for the Market Simulator Demo with:

1. Server-side stochastic market simulation.
2. Multi-client real-time updates.
3. In-memory account/session management.
4. Deterministic trade acceptance/rejection for timestamp collisions.

## 2. Runtime Topology

1. One Node.js process hosts:
2. HTTP server for basic health endpoint.
3. WebSocket server for all client actions and live events.
4. In-memory state container for market, accounts, sessions, and trade feed.
5. Simulation loop ticking once per second (1 second = 1 simulated day).

## 3. Core Modules

1. src/server/index.js:
2. Server bootstrap, WebSocket lifecycle, action routing, broadcast fan-out.
3. src/server/state.js:
4. In-memory domain model and state helpers for accounts/stocks/trade feed.
5. src/server/simulation.js:
6. Tick function and stochastic price evolution logic.
7. src/server/protocol.js:
8. JSON message parsing and event encoding.
9. src/server/config.js:
10. Initial constants and stock profile seeds.
11. src/server/random.js:
12. Random number helpers (Gaussian noise + spike sign).

## 4. In-Memory Data Model

### 4.1 Accounts

Stored in map keyed by username.

Fields:
1. username
2. salt
3. passwordHash (scrypt)
4. cash
5. holdings (symbol -> integer shares)
6. createdAtMs

Notes:
1. No persistence across server restart.
2. Passwords are salted and hashed in memory (demo-safe baseline without database).

### 4.2 Sessions

Stored in map keyed by sessionToken.

Fields:
1. username
2. issuedAtMs

Notes:
1. Session token issued on login.
2. Session invalidated on logout and socket close.

### 4.3 Stocks

Stored in map keyed by symbol.

Fields:
1. symbol, name, profile
2. price
3. openPriceYtd
4. allTimeHigh
5. totalVolume
6. annualDrift, dailyVolatility, spikeChance, spikeMagnitude
7. priceHistory [{ simulatedDay, price }]

Profiles seeded:
1. GIDX (index-like)
2. BTEC (high-volatility tech)
3. PNYX (penny)

### 4.4 Trade Feed

Stored as reverse-chronological array with max length cap.

Trade event fields:
1. id
2. receivedAtMs
3. username
4. symbol
5. side
6. quantity
7. executedPrice (accepted only)
8. notional (accepted only)
9. status (accepted/rejected)
10. rejection object (rejected only)

## 5. Simulation Engine

Tick cadence:
1. setInterval at 1000 ms.
2. Each tick increments simulatedDay by 1.

Price model per stock each tick:
1. dailyReturn = driftPerDay + GaussianShock + optionalSpike
2. driftPerDay = annualDrift / 365
3. GaussianShock based on dailyVolatility
4. optionalSpike occurs with spikeChance and random sign
5. price = max(0.1, price * (1 + dailyReturn))

Derived updates:
1. allTimeHigh recomputed.
2. Price point appended to bounded history.
3. market_tick broadcast emitted to all clients.

## 6. Client Action API (WebSocket)

Envelope format (client -> server):

{
  "type": "action_name",
  "requestId": "optional-client-id",
  "payload": { ... }
}

Supported actions:
1. register
Payload: { username, password }
Response: registered or error

2. login
Payload: { username, password }
Response: logged_in + sessionToken, then snapshot

3. logout
Payload: {}
Response: logged_out, then public snapshot

4. place_order
Payload: { symbol, side, quantity }
Response: trade_accepted or trade_rejected

5. get_snapshot
Payload: {}
Response: snapshot + snapshot_ack

## 7. Server Event API (WebSocket)

Common envelope:

{
  "type": "event_name",
  "requestId": "echoed if direct response",
  "payload": { ... },
  "emittedAtMs": 1234567890
}

Primary events:
1. snapshot
2. market_tick
3. stocks_updated
4. trade_feed_update
5. trade_accepted
6. trade_rejected
7. account_updated
8. error

## 8. Trading Semantics

Order type:
1. Market order only.

Validation:
1. Auth required.
2. Symbol exists.
3. quantity positive integer.
4. Buy requires sufficient funds.
5. Sell requires sufficient holdings.

Execution:
1. Immediate at current server price.
2. Updates account cash and holdings.
3. Updates stock totalVolume.
4. Applies small immediate market impact factor.
5. Emits account and market update events.

## 9. Concurrency and Determinism

Atomicity model:
1. Single-process server event loop serializes actions.
2. Trade processing guard lock avoids overlapping trade mutation sections.

Collision rule implementation:
1. Server computes receivedAtMs = Date.now() at intake.
2. If an accepted trade already used the same receivedAtMs, next same-ms trade is rejected.
3. Rejection reason code: TRADE_COLLISION.

Result:
1. One trade accepted.
2. Competing same-timestamp trade rejected deterministically by intake order.

## 10. Error Model

Standard error payload:
1. code
2. message

Current error codes:
1. BAD_MESSAGE
2. UNKNOWN_ACTION
3. INVALID_INPUT
4. INVALID_CREDENTIALS
5. UNAUTHENTICATED
6. SESSION_EXPIRED
7. UNKNOWN_SYMBOL
8. INVALID_QUANTITY
9. INVALID_SIDE
10. INSUFFICIENT_FUNDS
11. INSUFFICIENT_HOLDINGS
12. TRADE_COLLISION
13. TRADE_BUSY
14. USERNAME_TAKEN

## 11. Security Notes (Demo Scope)

1. Passwords are not persisted and are held only in-memory while process is alive.
2. Passwords are salted and hashed via scrypt before storage.
3. Session tokens are random bytes and invalidated on disconnect/logout.
4. No TLS, CSRF hardening, or production identity controls in this baseline.

## 12. Next Implementation Steps

1. Add frontend client app and WebSocket action/event integration.
2. Add schema validation per action payload.
3. Add deterministic order queue with explicit sequence IDs.
4. Add unit tests for simulation drift and trade validation.
5. Add integration tests for concurrent trade collision behavior.
