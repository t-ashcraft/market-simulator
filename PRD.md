# Product Requirements Document (PRD)

## 1. Product Overview

### 1.1 Product Name
Market Simulator Demo

### 1.2 Purpose
Build a client-facing demonstration platform for simulated market trading that showcases:
1. Real-time market simulation with accelerated time.
2. Stochastic stock behavior across multiple stock archetypes.
3. Multi-client concurrent trading in a shared market.
4. Live visibility of how user trades impact market state.

### 1.3 Success Definition
The demo is successful if multiple clients can log in concurrently, observe live market movement, place trades, and see consistent market/account updates in real time, including deterministic handling of simultaneous trade submissions.

## 2. Goals and Non-Goals

### 2.1 Goals
1. Simulate a shared market with multiple stocks running server-side.
2. Run simulation at accelerated pace: 1 real second = 1 simulated market day.
3. Support multiple concurrent clients with live synchronized updates.
4. Allow authenticated users to buy and sell stocks with immediate execution (market orders only).
5. Reflect client trades in market statistics and shared trade feed.
6. Start each created account with a fixed balance of $100,000.
7. Keep all runtime state in memory while server is running.

### 2.2 Non-Goals
1. Persistent storage across server restarts.
2. Real broker integration or live market data.
3. Advanced order types (limit, stop, options, shorting, margin).
4. Enterprise security/compliance implementation.
5. Project milestones or phased rollout plans.

## 3. Users and Use Cases

### 3.1 Primary Users
1. Prospective clients viewing a market simulation demonstration.
2. Internal presenters running the demo in front of clients.

### 3.2 Core Use Cases
1. User creates an account and logs in.
2. User inspects multiple stocks and their charts/stats.
3. User buys and sells while watching market and portfolio updates.
4. User observes other clients' trades in a live feed.
5. Multiple users trade near-simultaneously, and server resolves conflicts deterministically.

## 4. Technical Scope and Constraints

### 4.1 Required Stack
1. Frontend: HTML, CSS, JavaScript.
2. Backend: JavaScript server.
3. Realtime transport: WebSockets.

### 4.2 State and Persistence
1. No database is required.
2. On every server boot, market state and account data reset to clean initial state.
3. While running, server maintains all market and client state in memory.

### 4.3 Time Model
1. Simulation must run at 1 real second = 1 simulated trading day.
2. Market evolution runs continuously on the server tick.

## 5. Functional Requirements

### 5.1 Authentication and Account Lifecycle
1. Users can create account credentials (username + password) during runtime.
2. Authentication is simple demo auth in memory.
3. Password reset and email verification are out of scope.
4. Each new account starts with cash balance = $100,000.
5. Only logged-in users may place trades.
6. Logged-out users can still view market graphs and stock stats.

### 5.2 Market Simulation
1. Simulation is fully server-side.
2. The server manages at least three stock profiles:
3. Index-like fund profile:
4. Long-run expected growth target around 4% per simulated year.
5. Moderate day-to-day stochastic variation.
6. Occasional positive or negative spikes.
7. Volatile big-tech profile:
8. High day-to-day volatility and wider return distribution.
9. Larger drawdowns and rallies than index profile.
10. Penny stock profile:
11. Low base price and high jump/fade behavior.
12. Rare sharp upward moves with higher crash/fizzle risk.
13. Server computes and updates per-stock metrics continuously.

### 5.3 Trading
1. Supported order type: market order only.
2. Buy and sell execute immediately at current server price.
3. Server validates sufficient buying power before buys.
4. Server validates sufficient share holdings before sells.
5. On successful trade, server updates:
6. User cash balance.
7. User positions.
8. User total account worth.
9. Stock volume traded.
10. Trade feed for that stock.
11. Trades affect market state and are visible to all connected clients.

### 5.4 Concurrency and Determinism
1. Server must support multiple clients issuing requests concurrently.
2. Trade processing must be atomic and serialized by server intake order.
3. If two trade requests have the exact same timestamp, the server accepts exactly one and rejects the other.
4. Tie-break rule: first received by server timestamp/order accepted, competing trade rejected.
5. Rejected trade response must include explicit reason code and message.
6. All clients must converge on identical market/account state after each processed event.

### 5.5 Real-Time Sync
1. Server pushes market ticks and trade events via WebSockets.
2. Clients receive updates without manual refresh.
3. On connect/reconnect, client receives current snapshot state before streaming incremental updates.

## 6. UI and UX Requirements

### 6.1 Overall Layout
1. Left panel: 1/4 width.
2. Middle panel: 2/4 width.
3. Right panel: 1/4 width.
4. Layout must function on desktop and mobile with responsive behavior.
5. Theme should include dark green backgrounds, light green borders/text, terminal-like fonts, and an overall hacker-like theme.

### 6.2 Left Panel (Authentication and Account)
1. Logged-out state shows login controls:
2. Account name field.
3. Password field.
4. Login action.
5. Logged-in state shows:
6. Username.
7. Logout action.
8. Current cash balance.
9. Held stocks/positions.
10. Trade controls enabled only when logged in.

### 6.3 Middle Panel (Market Graph + Tabs)
1. Shows graph for currently selected stock at all times.
2. Includes tabs at top for selecting inspected stock.
3. Graph remains visible regardless of login status.
4. Buy/sell controls in this area are disabled for logged-out users.

### 6.4 Right Panel (Stock Details + Live Activity)
1. Shows current stock statistics for selected stock:
2. Current price.
3. YTD return.
4. All-time high.
5. Total volume traded.
6. Shows live-updating feed of client trades for selected stock.

## 7. Data Model (In-Memory)

### 7.1 Account Entity
1. Username.
2. Password (demo-only handling in memory).
3. Cash balance.
4. Holdings map by symbol and quantity.
5. Real-time computed total account worth.

### 7.2 Stock Entity
1. Symbol and display name.
2. Current price.
3. Price history time series.
4. YTD return.
5. All-time high.
6. Total volume traded.
7. Simulation profile type (index, tech, penny).

### 7.3 Trade Event Entity
1. Event ID.
2. Server receive timestamp/order index.
3. Username.
4. Symbol.
5. Side (buy/sell).
6. Quantity.
7. Executed price.
8. Status (accepted/rejected).
9. Rejection reason when applicable.

## 8. API and Event Requirements

### 8.1 Client-to-Server Actions
1. Register account.
2. Login.
3. Logout.
4. Place buy order.
5. Place sell order.
6. Request market/account snapshot.

### 8.2 Server-to-Client Events
1. Initial snapshot event on connection/reconnection.
2. Market tick update events.
3. Trade accepted events.
4. Trade rejected events with reason.
5. Account update events for affected user.
6. Stock stats update events for all users.
7. Live trade feed events for selected symbol.

## 9. Error Handling Requirements

1. Invalid login credentials must return clear error.
2. Unauthenticated trade attempt must be rejected.
3. Buy with insufficient funds must be rejected.
4. Sell with insufficient holdings must be rejected.
5. Simultaneous trade collision loser must be rejected with deterministic reason.
6. Temporary disconnect must allow client to reconnect and resync current snapshot.

## 10. Non-Functional Requirements

1. Multi-client capable for demonstration usage.
2. State consistency must be preserved across all connected clients.
3. Trade and market updates should feel real-time to users.
4. Server must remain stable under concurrent request bursts typical for demo sessions.
5. All behavior must be deterministic for conflict resolution and reproducibility in demos.

## 11. Acceptance Criteria

1. A new account receives exactly $100,000 starting cash.
2. Logged-out user can view charts/stats but cannot trade.
3. Logged-in user can submit market buy/sell orders and receive immediate result.
4. Account balances and holdings update correctly after each accepted trade.
5. Right-panel stats update as market evolves and trades occur.
6. Trade feed displays live trades from all clients on selected stock.
7. Two near-simultaneous orders can be processed without state corruption.
8. If two orders are truly simultaneous, one is accepted and one is rejected deterministically.
9. Rejected order includes machine-usable reason and human-readable message.
10. Restarting server resets all accounts, holdings, and market history.
11. During single server runtime, all market and client state is retained in memory.

## 12. Out-of-Scope Future Enhancements

1. Persistent accounts and historical sessions.
2. Rich order book and advanced order types.
3. AI-driven strategy bots.
4. Leaderboards and tournament modes.
5. Admin control console and replay tools.
