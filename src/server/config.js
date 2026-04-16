const INITIAL_CASH = 100000;
const TICK_INTERVAL_MS = 1000;
const PRICE_HISTORY_LIMIT = 365;
const TRADE_FEED_LIMIT = 250;

const STOCK_SEED = [
  {
    symbol: 'GIDX',
    name: 'Global Index Fund',
    profile: 'index',
    initialPrice: 100,
    annualDrift: 0.04,
    dailyVolatility: 0.007,
    spikeChance: 0.01,
    spikeMagnitude: 0.03,
  },
  {
    symbol: 'BTEC',
    name: 'Big Tech Growth',
    profile: 'tech',
    initialPrice: 220,
    annualDrift: 0.09,
    dailyVolatility: 0.03,
    spikeChance: 0.04,
    spikeMagnitude: 0.12,
  },
  {
    symbol: 'PNYX',
    name: 'Penny Nova',
    profile: 'penny',
    initialPrice: 6,
    annualDrift: 0.02,
    dailyVolatility: 0.07,
    spikeChance: 0.08,
    spikeMagnitude: 0.35,
  },
];

module.exports = {
  INITIAL_CASH,
  TICK_INTERVAL_MS,
  PRICE_HISTORY_LIMIT,
  TRADE_FEED_LIMIT,
  STOCK_SEED,
};
