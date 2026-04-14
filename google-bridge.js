// SAFE MODE – Google отключен, сайт работает локально

window.GoogleBridge = {
  readConnection: () => ({ mode: 'local' }),
  writeConnection: () => {},
  setSyncStatus: () => {},
  ping: async () => ({ ok: true, message: 'disabled' }),
  bootstrap: async () => null,
  syncSingle: async () => ({ ok: true })
};
