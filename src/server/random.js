function gaussianRandom() {
  let u = 0;
  let v = 0;

  while (u === 0) {
    u = Math.random();
  }
  while (v === 0) {
    v = Math.random();
  }

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

module.exports = {
  gaussianRandom,
  randomSign,
};
