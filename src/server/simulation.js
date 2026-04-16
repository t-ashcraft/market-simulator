const { gaussianRandom, randomSign } = require('./random');

const TRADING_DAYS_PER_YEAR = 365;

function clampPrice(nextPrice) {
  return Math.max(0.1, nextPrice);
}

function runSimulationTick(state) {
  state.simulatedDay += 1;

  for (const stock of state.getAllStocks()) {
    const driftPerDay = stock.annualDrift / TRADING_DAYS_PER_YEAR;
    const randomShock = stock.dailyVolatility * gaussianRandom();

    let jump = 0;
    if (Math.random() < stock.spikeChance) {
      jump = stock.spikeMagnitude * randomSign();
    }

    const dailyReturn = driftPerDay + randomShock + jump;
    stock.price = clampPrice(stock.price * (1 + dailyReturn));
    stock.allTimeHigh = Math.max(stock.allTimeHigh, stock.price);

    state.pushPricePoint(stock);
  }
}

module.exports = {
  runSimulationTick,
};
