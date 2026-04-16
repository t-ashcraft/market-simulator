const http = require('http');
const WebSocket = require('ws');

const { TICK_INTERVAL_MS } = require('./config');
const { MarketState } = require('./state');
const { runSimulationTick } = require('./simulation');
const { parseMessage, makeEvent } = require('./protocol');

const PORT = Number(process.env.PORT || 3000);

const state = new MarketState();
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found.' }));
});

const wss = new WebSocket.Server({ server });

const sockets = new Set();
const socketSession = new WeakMap();

function send(ws, type, payload, requestId = null) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(makeEvent(type, payload, requestId));
}

function broadcast(type, payload) {
  const encoded = makeEvent(type, payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encoded);
    }
  }
}

function sendSnapshot(ws, username = null) {
  const account = username ? state.accountSnapshot(username) : null;

  send(ws, 'snapshot', {
    simulatedDay: state.simulatedDay,
    stocks: state.stockSnapshot(),
    tradeFeed: state.tradeFeed,
    account,
  });
}

function requireAuth(ws, requestId) {
  const sessionToken = socketSession.get(ws);
  if (!sessionToken) {
    send(ws, 'error', {
      code: 'UNAUTHENTICATED',
      message: 'You must be logged in to perform this action.',
    }, requestId);
    return null;
  }

  const session = state.getSession(sessionToken);
  if (!session) {
    send(ws, 'error', {
      code: 'SESSION_EXPIRED',
      message: 'Your session is invalid. Please log in again.',
    }, requestId);
    return null;
  }

  return session;
}

function handleRegister(ws, payload, requestId) {
  const username = String(payload?.username || '').trim();
  const password = String(payload?.password || '');

  if (!username || !password) {
    send(ws, 'error', {
      code: 'INVALID_INPUT',
      message: 'Username and password are required.',
    }, requestId);
    return;
  }

  const result = state.createAccount(username, password);
  if (!result.ok) {
    send(ws, 'error', result.error, requestId);
    return;
  }

  send(ws, 'registered', { username }, requestId);
}

function handleLogin(ws, payload, requestId) {
  const username = String(payload?.username || '').trim();
  const password = String(payload?.password || '');

  if (!username || !password || !state.validatePassword(username, password)) {
    send(ws, 'error', {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password.',
    }, requestId);
    return;
  }

  const token = state.createSession(username);
  socketSession.set(ws, token);

  send(ws, 'logged_in', {
    username,
    sessionToken: token,
  }, requestId);

  sendSnapshot(ws, username);
}

function handleLogout(ws, requestId) {
  const token = socketSession.get(ws);
  if (token) {
    state.invalidateSession(token);
    socketSession.delete(ws);
  }

  send(ws, 'logged_out', { ok: true }, requestId);
  sendSnapshot(ws);
}

function processTrade({ username, symbol, side, quantity, receivedAtMs }) {
  const stock = state.getStock(symbol);
  if (!stock) {
    return {
      ok: false,
      reason: {
        code: 'UNKNOWN_SYMBOL',
        message: `Unknown symbol: ${symbol}`,
      },
    };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      reason: {
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive integer.',
      },
    };
  }

  if (state.lastAcceptedTradeTimestampMs === receivedAtMs) {
    return {
      ok: false,
      reason: {
        code: 'TRADE_COLLISION',
        message: 'Another trade at this exact server timestamp was already accepted.',
      },
    };
  }

  const account = state.getAccount(username);
  const notional = state.roundToCents(stock.price * quantity);

  if (side === 'buy') {
    if (account.cash < notional) {
      return {
        ok: false,
        reason: {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient funds for this purchase.',
        },
      };
    }

    account.cash = state.roundToCents(account.cash - notional);
    account.holdings[symbol] = (account.holdings[symbol] || 0) + quantity;
  } else if (side === 'sell') {
    const held = account.holdings[symbol] || 0;
    if (held < quantity) {
      return {
        ok: false,
        reason: {
          code: 'INSUFFICIENT_HOLDINGS',
          message: 'Insufficient holdings for this sale.',
        },
      };
    }

    account.holdings[symbol] = held - quantity;
    if (account.holdings[symbol] === 0) {
      delete account.holdings[symbol];
    }
    account.cash = state.roundToCents(account.cash + notional);
  } else {
    return {
      ok: false,
      reason: {
        code: 'INVALID_SIDE',
        message: 'Order side must be buy or sell.',
      },
    };
  }

  stock.totalVolume += quantity;

  const marketImpactFactor = side === 'buy' ? 0.0004 : -0.0004;
  stock.price = Math.max(0.1, stock.price * (1 + marketImpactFactor * quantity));
  stock.allTimeHigh = Math.max(stock.allTimeHigh, stock.price);

  const tradeEvent = {
    id: state.nextTradeEvent(),
    receivedAtMs,
    username,
    symbol,
    side,
    quantity,
    executedPrice: state.roundToCents(stock.price),
    notional,
    status: 'accepted',
  };

  state.appendTradeFeed(tradeEvent);
  state.lastAcceptedTradeTimestampMs = receivedAtMs;

  return {
    ok: true,
    tradeEvent,
    accountSnapshot: state.accountSnapshot(username),
  };
}

function handlePlaceOrder(ws, payload, requestId) {
  const session = requireAuth(ws, requestId);
  if (!session) {
    return;
  }

  const username = session.username;
  const symbol = String(payload?.symbol || '').trim().toUpperCase();
  const side = String(payload?.side || '').trim().toLowerCase();
  const quantity = Number(payload?.quantity);
  const receivedAtMs = Date.now();

  if (state.tradeProcessingLock) {
    send(ws, 'error', {
      code: 'TRADE_BUSY',
      message: 'Trade engine busy, retry shortly.',
    }, requestId);
    return;
  }

  state.tradeProcessingLock = true;
  try {
    const outcome = processTrade({
      username,
      symbol,
      side,
      quantity,
      receivedAtMs,
    });

    if (!outcome.ok) {
      const rejectedTrade = {
        id: state.nextTradeEvent(),
        receivedAtMs,
        username,
        symbol,
        side,
        quantity,
        status: 'rejected',
        rejection: outcome.reason,
      };

      send(ws, 'trade_rejected', rejectedTrade, requestId);
      return;
    }

    send(ws, 'trade_accepted', outcome.tradeEvent, requestId);
    send(ws, 'account_updated', outcome.accountSnapshot);

    broadcast('trade_feed_update', outcome.tradeEvent);
    broadcast('stocks_updated', {
      simulatedDay: state.simulatedDay,
      stocks: state.stockSnapshot(),
    });
  } finally {
    state.tradeProcessingLock = false;
  }
}

function handleGetSnapshot(ws, requestId) {
  const token = socketSession.get(ws);
  const session = token ? state.getSession(token) : null;
  sendSnapshot(ws, session?.username || null);
  send(ws, 'snapshot_ack', { ok: true }, requestId);
}

function handleMessage(ws, rawMessage) {
  const parsed = parseMessage(rawMessage);
  if (!parsed.ok) {
    send(ws, 'error', {
      code: 'BAD_MESSAGE',
      message: parsed.error,
    });
    return;
  }

  const { type, payload, requestId = null } = parsed.message;

  switch (type) {
    case 'register':
      handleRegister(ws, payload, requestId);
      break;
    case 'login':
      handleLogin(ws, payload, requestId);
      break;
    case 'logout':
      handleLogout(ws, requestId);
      break;
    case 'place_order':
      handlePlaceOrder(ws, payload, requestId);
      break;
    case 'get_snapshot':
      handleGetSnapshot(ws, requestId);
      break;
    default:
      send(ws, 'error', {
        code: 'UNKNOWN_ACTION',
        message: `Unknown action type: ${type}`,
      }, requestId);
      break;
  }
}

wss.on('connection', (ws) => {
  sockets.add(ws);
  sendSnapshot(ws);

  ws.on('message', (rawMessage) => {
    handleMessage(ws, rawMessage);
  });

  ws.on('close', () => {
    const token = socketSession.get(ws);
    if (token) {
      state.invalidateSession(token);
      socketSession.delete(ws);
    }
    sockets.delete(ws);
  });

  ws.on('error', () => {
    sockets.delete(ws);
  });
});

setInterval(() => {
  runSimulationTick(state);
  broadcast('market_tick', {
    simulatedDay: state.simulatedDay,
    stocks: state.stockSnapshot(),
  });
}, TICK_INTERVAL_MS);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Market simulator server listening on port ${PORT}`);
});
