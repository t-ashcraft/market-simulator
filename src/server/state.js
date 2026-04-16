const crypto = require('crypto');
const {
  INITIAL_CASH,
  PRICE_HISTORY_LIMIT,
  TRADE_FEED_LIMIT,
  STOCK_SEED,
} = require('./config');

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

function createStock(seed) {
  return {
    symbol: seed.symbol,
    name: seed.name,
    profile: seed.profile,
    price: seed.initialPrice,
    openPriceYtd: seed.initialPrice,
    allTimeHigh: seed.initialPrice,
    totalVolume: 0,
    annualDrift: seed.annualDrift,
    dailyVolatility: seed.dailyVolatility,
    spikeChance: seed.spikeChance,
    spikeMagnitude: seed.spikeMagnitude,
    priceHistory: [
      {
        simulatedDay: 0,
        price: seed.initialPrice,
      },
    ],
  };
}

function hashPassword(rawPassword, salt) {
  return crypto.scryptSync(rawPassword, salt, 64).toString('hex');
}

class MarketState {
  constructor() {
    this.simulatedDay = 0;
    this.accounts = new Map();
    this.sessions = new Map();
    this.stocks = new Map(STOCK_SEED.map((seed) => [seed.symbol, createStock(seed)]));
    this.tradeFeed = [];
    this.nextTradeId = 1;
    this.tradeProcessingLock = false;
    this.lastAcceptedTradeTimestampMs = null;
  }

  createAccount(username, password) {
    if (this.accounts.has(username)) {
      return {
        ok: false,
        error: {
          code: 'USERNAME_TAKEN',
          message: 'That username is already in use.',
        },
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    this.accounts.set(username, {
      username,
      salt,
      passwordHash,
      cash: INITIAL_CASH,
      holdings: {},
      createdAtMs: Date.now(),
    });

    return { ok: true };
  }

  validatePassword(username, password) {
    const account = this.accounts.get(username);
    if (!account) {
      return false;
    }

    const computedHash = hashPassword(password, account.salt);
    return crypto.timingSafeEqual(Buffer.from(account.passwordHash), Buffer.from(computedHash));
  }

  createSession(username) {
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, {
      username,
      issuedAtMs: Date.now(),
    });
    return token;
  }

  invalidateSession(token) {
    this.sessions.delete(token);
  }

  getSession(token) {
    return this.sessions.get(token);
  }

  getAccount(username) {
    return this.accounts.get(username);
  }

  getStock(symbol) {
    return this.stocks.get(symbol);
  }

  getAllStocks() {
    return Array.from(this.stocks.values());
  }

  computeAccountWorth(username) {
    const account = this.accounts.get(username);
    if (!account) {
      return null;
    }

    let holdingsValue = 0;
    for (const [symbol, quantity] of Object.entries(account.holdings)) {
      const stock = this.stocks.get(symbol);
      if (!stock) {
        continue;
      }
      holdingsValue += quantity * stock.price;
    }

    return {
      cash: roundToCents(account.cash),
      holdingsValue: roundToCents(holdingsValue),
      totalWorth: roundToCents(account.cash + holdingsValue),
    };
  }

  nextTradeEvent() {
    const eventId = this.nextTradeId;
    this.nextTradeId += 1;
    return eventId;
  }

  appendTradeFeed(tradeEvent) {
    this.tradeFeed.unshift(tradeEvent);
    if (this.tradeFeed.length > TRADE_FEED_LIMIT) {
      this.tradeFeed.length = TRADE_FEED_LIMIT;
    }
  }

  stockSnapshot() {
    return this.getAllStocks().map((stock) => {
      const ytdReturn = stock.openPriceYtd <= 0
        ? 0
        : ((stock.price - stock.openPriceYtd) / stock.openPriceYtd) * 100;

      return {
        symbol: stock.symbol,
        name: stock.name,
        profile: stock.profile,
        price: roundToCents(stock.price),
        ytdReturnPct: roundToCents(ytdReturn),
        allTimeHigh: roundToCents(stock.allTimeHigh),
        totalVolume: stock.totalVolume,
        priceHistory: stock.priceHistory,
      };
    });
  }

  accountSnapshot(username) {
    const account = this.accounts.get(username);
    if (!account) {
      return null;
    }

    const worth = this.computeAccountWorth(username);

    return {
      username: account.username,
      cash: worth.cash,
      holdingsValue: worth.holdingsValue,
      totalWorth: worth.totalWorth,
      holdings: account.holdings,
    };
  }

  pushPricePoint(stock) {
    stock.priceHistory.push({
      simulatedDay: this.simulatedDay,
      price: roundToCents(stock.price),
    });

    if (stock.priceHistory.length > PRICE_HISTORY_LIMIT) {
      stock.priceHistory.shift();
    }
  }

  roundToCents(value) {
    return roundToCents(value);
  }
}

module.exports = {
  MarketState,
};
