const appState = {
  ws: null,
  connected: false,
  requestSeq: 1,
  loggedIn: false,
  username: null,
  simulatedDay: 0,
  selectedSymbol: null,
  stocksBySymbol: new Map(),
  tradeFeed: [],
  account: null,
};

const ui = {
  authLoggedOut: document.getElementById('authLoggedOut'),
  authLoggedIn: document.getElementById('authLoggedIn'),
  usernameInput: document.getElementById('usernameInput'),
  passwordInput: document.getElementById('passwordInput'),
  registerBtn: document.getElementById('registerBtn'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  sessionUsername: document.getElementById('sessionUsername'),
  sessionCash: document.getElementById('sessionCash'),
  sessionHoldingsValue: document.getElementById('sessionHoldingsValue'),
  sessionTotalWorth: document.getElementById('sessionTotalWorth'),
  holdingsList: document.getElementById('holdingsList'),
  connectionStatus: document.getElementById('connectionStatus'),
  refreshSnapshotBtn: document.getElementById('refreshSnapshotBtn'),
  stockTabs: document.getElementById('stockTabs'),
  chartTitle: document.getElementById('chartTitle'),
  chartCanvas: document.getElementById('priceChart'),
  tradeSymbol: document.getElementById('tradeSymbol'),
  tradeQuantity: document.getElementById('tradeQuantity'),
  buyBtn: document.getElementById('buyBtn'),
  sellBtn: document.getElementById('sellBtn'),
  tradeStatus: document.getElementById('tradeStatus'),
  statSymbol: document.getElementById('statSymbol'),
  statPrice: document.getElementById('statPrice'),
  statYtd: document.getElementById('statYtd'),
  statAth: document.getElementById('statAth'),
  statVolume: document.getElementById('statVolume'),
  tradeFeedList: document.getElementById('tradeFeedList'),
  responseList: document.getElementById('responseList'),
};

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function wsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function nextRequestId() {
  const id = `req-${Date.now()}-${appState.requestSeq}`;
  appState.requestSeq += 1;
  return id;
}

function sendAction(type, payload = {}) {
  if (!appState.ws || appState.ws.readyState !== WebSocket.OPEN) {
    pushResponse('ERROR', 'Socket is not connected.');
    return null;
  }

  const requestId = nextRequestId();
  appState.ws.send(JSON.stringify({ type, payload, requestId }));
  return requestId;
}

function pushResponse(kind, text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} [${kind}] ${text}`;
  ui.responseList.prepend(li);
  while (ui.responseList.children.length > 40) {
    ui.responseList.removeChild(ui.responseList.lastChild);
  }
}

function setConnectionStatus(connected) {
  appState.connected = connected;
  ui.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
  ui.connectionStatus.style.color = connected ? '#7cff8d' : '#ff8d8d';
}

function setTradeStatus(text, isError = false) {
  ui.tradeStatus.textContent = text;
  ui.tradeStatus.style.color = isError ? '#ff8d8d' : '#9edab4';
}

function selectedStock() {
  if (!appState.selectedSymbol) {
    return null;
  }
  return appState.stocksBySymbol.get(appState.selectedSymbol) || null;
}

function updateAuthUI() {
  ui.authLoggedOut.classList.toggle('hidden', appState.loggedIn);
  ui.authLoggedIn.classList.toggle('hidden', !appState.loggedIn);

  ui.buyBtn.disabled = !appState.loggedIn;
  ui.sellBtn.disabled = !appState.loggedIn;

  if (!appState.loggedIn) {
    ui.sessionUsername.textContent = '-';
    ui.sessionCash.textContent = '$0.00';
    ui.sessionHoldingsValue.textContent = '$0.00';
    ui.sessionTotalWorth.textContent = '$0.00';
    ui.holdingsList.innerHTML = '<li>No active account.</li>';
    setTradeStatus('Log in to place trades.');
    return;
  }

  const account = appState.account;
  ui.sessionUsername.textContent = appState.username || '-';
  ui.sessionCash.textContent = formatMoney(account?.cash);
  ui.sessionHoldingsValue.textContent = formatMoney(account?.holdingsValue);
  ui.sessionTotalWorth.textContent = formatMoney(account?.totalWorth);

  const holdings = account?.holdings || {};
  const entries = Object.entries(holdings);
  if (!entries.length) {
    ui.holdingsList.innerHTML = '<li>No holdings yet.</li>';
  } else {
    ui.holdingsList.innerHTML = entries
      .map(([symbol, qty]) => `<li>${symbol}: ${qty} shares</li>`)
      .join('');
  }
}

function renderTabs() {
  ui.stockTabs.innerHTML = '';
  const stocks = Array.from(appState.stocksBySymbol.values());

  if (!stocks.length) {
    return;
  }

  if (!appState.selectedSymbol || !appState.stocksBySymbol.has(appState.selectedSymbol)) {
    appState.selectedSymbol = stocks[0].symbol;
  }

  for (const stock of stocks) {
    const tab = document.createElement('button');
    tab.className = `tab ${stock.symbol === appState.selectedSymbol ? 'active' : ''}`;
    tab.textContent = `${stock.symbol} (${stock.name})`;
    tab.addEventListener('click', () => {
      appState.selectedSymbol = stock.symbol;
      ui.tradeSymbol.value = stock.symbol;
      render();
    });
    ui.stockTabs.appendChild(tab);
  }
}

function renderStats() {
  const stock = selectedStock();
  if (!stock) {
    ui.statSymbol.textContent = '-';
    ui.statPrice.textContent = '$0.00';
    ui.statYtd.textContent = '0.00%';
    ui.statAth.textContent = '$0.00';
    ui.statVolume.textContent = '0';
    return;
  }

  ui.statSymbol.textContent = stock.symbol;
  ui.statPrice.textContent = formatMoney(stock.price);
  ui.statYtd.textContent = formatPct(stock.ytdReturnPct);
  ui.statYtd.className = Number(stock.ytdReturnPct) >= 0 ? 'positive' : 'negative';
  ui.statAth.textContent = formatMoney(stock.allTimeHigh);
  ui.statVolume.textContent = Number(stock.totalVolume || 0).toLocaleString();
}

function renderTradeFeed() {
  const symbol = appState.selectedSymbol;
  const relevant = appState.tradeFeed
    .filter((item) => item.symbol === symbol)
    .slice(0, 50);

  if (!relevant.length) {
    ui.tradeFeedList.innerHTML = '<li>No trades yet for this symbol.</li>';
    return;
  }

  ui.tradeFeedList.innerHTML = relevant
    .map((trade) => {
      const side = String(trade.side || '').toUpperCase();
      const pricePart = trade.executedPrice ? ` @ ${formatMoney(trade.executedPrice)}` : '';
      const statusPart = trade.status === 'rejected'
        ? ` REJECTED (${trade.rejection?.code || 'UNKNOWN'})`
        : ' ACCEPTED';
      return `<li>${trade.username} ${side} ${trade.quantity} ${trade.symbol}${pricePart}${statusPart}</li>`;
    })
    .join('');
}

function drawChart() {
  const stock = selectedStock();
  const canvas = ui.chartCanvas;
  const ctx = canvas.getContext('2d');

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!stock || !Array.isArray(stock.priceHistory) || stock.priceHistory.length < 2) {
    ctx.fillStyle = '#72b08b';
    ctx.font = '14px IBM Plex Mono, monospace';
    ctx.fillText('Waiting for market data...', 20, 30);
    return;
  }

  const padding = { top: 20, right: 18, bottom: 28, left: 46 };
  const chartW = canvas.width - padding.left - padding.right;
  const chartH = canvas.height - padding.top - padding.bottom;

  const points = stock.priceHistory;
  const prices = points.map((p) => Number(p.price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = Math.max(0.0001, maxPrice - minPrice);

  ctx.strokeStyle = 'rgba(42, 224, 111, 0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#2ae06f';
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = padding.left + (chartW * index) / (points.length - 1);
    const y = padding.top + (1 - (Number(point.price) - minPrice) / spread) * chartH;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  ctx.fillStyle = '#9edab4';
  ctx.font = '12px IBM Plex Mono, monospace';
  ctx.fillText(`High ${formatMoney(maxPrice)}`, 10, 16);
  ctx.fillText(`Low ${formatMoney(minPrice)}`, 10, canvas.height - 10);

  const firstDay = points[0].simulatedDay;
  const lastDay = points[points.length - 1].simulatedDay;
  ctx.fillText(`Day ${firstDay}`, padding.left, canvas.height - 10);
  const dayLabel = `Day ${lastDay}`;
  const dayLabelWidth = ctx.measureText(dayLabel).width;
  ctx.fillText(dayLabel, canvas.width - padding.right - dayLabelWidth, canvas.height - 10);
}

function renderHeader() {
  const stock = selectedStock();
  if (!stock) {
    ui.chartTitle.textContent = `Market Chart | Sim Day ${appState.simulatedDay}`;
    ui.tradeSymbol.value = '';
    return;
  }

  ui.chartTitle.textContent = `${stock.symbol} | ${stock.name} | Sim Day ${appState.simulatedDay}`;
  ui.tradeSymbol.value = stock.symbol;
}

function render() {
  updateAuthUI();
  renderTabs();
  renderHeader();
  renderStats();
  renderTradeFeed();
  drawChart();
}

function mergeStocks(stocks) {
  for (const stock of stocks || []) {
    appState.stocksBySymbol.set(stock.symbol, stock);
  }
}

function handleEvent(message) {
  const { type, payload } = message;

  switch (type) {
    case 'snapshot':
      appState.simulatedDay = payload.simulatedDay || 0;
      mergeStocks(payload.stocks || []);
      appState.tradeFeed = Array.isArray(payload.tradeFeed) ? payload.tradeFeed : [];
      appState.account = payload.account || null;
      if (payload.account) {
        appState.loggedIn = true;
        appState.username = payload.account.username;
      }
      if (!payload.account && appState.loggedIn) {
        appState.loggedIn = false;
        appState.username = null;
        appState.account = null;
      }
      render();
      break;

    case 'market_tick':
    case 'stocks_updated':
      appState.simulatedDay = payload.simulatedDay || appState.simulatedDay;
      mergeStocks(payload.stocks || []);
      render();
      break;

    case 'trade_feed_update':
      appState.tradeFeed.unshift(payload);
      if (appState.tradeFeed.length > 250) {
        appState.tradeFeed.length = 250;
      }
      renderTradeFeed();
      break;

    case 'account_updated':
      appState.account = payload;
      appState.loggedIn = true;
      appState.username = payload.username;
      updateAuthUI();
      break;

    case 'registered':
      pushResponse('OK', `Registered user ${payload.username}.`);
      setTradeStatus(`Registered ${payload.username}. You can log in now.`);
      break;

    case 'logged_in':
      appState.loggedIn = true;
      appState.username = payload.username;
      pushResponse('OK', `Logged in as ${payload.username}.`);
      setTradeStatus('Ready to trade.');
      render();
      break;

    case 'logged_out':
      appState.loggedIn = false;
      appState.username = null;
      appState.account = null;
      pushResponse('OK', 'Logged out.');
      setTradeStatus('Logged out.');
      render();
      break;

    case 'trade_accepted':
      pushResponse('OK', `Trade accepted: ${payload.side} ${payload.quantity} ${payload.symbol}.`);
      setTradeStatus(`Trade accepted: ${payload.side.toUpperCase()} ${payload.quantity} ${payload.symbol}.`);
      break;

    case 'trade_rejected':
      pushResponse('ERROR', `Trade rejected (${payload.rejection?.code || 'UNKNOWN'}).`);
      setTradeStatus(
        `Trade rejected: ${payload.rejection?.message || 'Unknown error.'}`,
        true
      );
      break;

    case 'snapshot_ack':
      pushResponse('OK', 'Snapshot refreshed.');
      break;

    case 'error':
      pushResponse('ERROR', `${payload.code}: ${payload.message}`);
      setTradeStatus(payload.message, true);
      break;

    default:
      break;
  }
}

function connectWebSocket() {
  const socket = new WebSocket(wsUrl());
  appState.ws = socket;

  socket.addEventListener('open', () => {
    setConnectionStatus(true);
    pushResponse('INFO', 'Connected to server.');
    sendAction('get_snapshot');
  });

  socket.addEventListener('message', (event) => {
    try {
      const parsed = JSON.parse(event.data);
      handleEvent(parsed);
    } catch (error) {
      pushResponse('ERROR', 'Failed to parse server message.');
    }
  });

  socket.addEventListener('close', () => {
    setConnectionStatus(false);
    appState.loggedIn = false;
    appState.username = null;
    appState.account = null;
    render();
    pushResponse('INFO', 'Connection closed. Reconnecting...');
    setTimeout(connectWebSocket, 1200);
  });

  socket.addEventListener('error', () => {
    pushResponse('ERROR', 'WebSocket error encountered.');
  });
}

function bindUiActions() {
  ui.registerBtn.addEventListener('click', () => {
    const username = ui.usernameInput.value.trim();
    const password = ui.passwordInput.value;
    sendAction('register', { username, password });
  });

  ui.loginBtn.addEventListener('click', () => {
    const username = ui.usernameInput.value.trim();
    const password = ui.passwordInput.value;
    sendAction('login', { username, password });
  });

  ui.logoutBtn.addEventListener('click', () => {
    sendAction('logout', {});
  });

  ui.refreshSnapshotBtn.addEventListener('click', () => {
    sendAction('get_snapshot', {});
  });

  ui.buyBtn.addEventListener('click', () => {
    const quantity = Number(ui.tradeQuantity.value);
    const symbol = appState.selectedSymbol;
    sendAction('place_order', { symbol, side: 'buy', quantity });
  });

  ui.sellBtn.addEventListener('click', () => {
    const quantity = Number(ui.tradeQuantity.value);
    const symbol = appState.selectedSymbol;
    sendAction('place_order', { symbol, side: 'sell', quantity });
  });

  window.addEventListener('resize', drawChart);
}

bindUiActions();
render();
connectWebSocket();
