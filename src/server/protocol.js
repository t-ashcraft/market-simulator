function parseMessage(raw) {
  try {
    const parsed = JSON.parse(raw.toString());
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Message must be an object.' };
    }
    if (!parsed.type || typeof parsed.type !== 'string') {
      return { ok: false, error: 'Message must include a string type.' };
    }
    return { ok: true, message: parsed };
  } catch (error) {
    return { ok: false, error: 'Invalid JSON payload.' };
  }
}

function makeEvent(type, payload, requestId = null) {
  return JSON.stringify({
    type,
    requestId,
    payload,
    emittedAtMs: Date.now(),
  });
}

module.exports = {
  parseMessage,
  makeEvent,
};
