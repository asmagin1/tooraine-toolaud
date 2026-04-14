(function () {
  const STORE_KEY = 'google_connection_settings_v1';
  const STATUS_KEY = 'google_sync_status_v1';

  function safeParse(v, fallback) {
    try { return JSON.parse(v); } catch { return fallback; }
  }

  function readConnection() {
    const cfg = safeParse(localStorage.getItem(STORE_KEY) || '{}', {});
    return {
      mode: (cfg.mode || 'local').trim(),
      appsScriptUrl: (cfg.appsScriptUrl || '').trim(),
      spreadsheetId: (cfg.spreadsheetId || '').trim(),
      spreadsheetUrl: (cfg.spreadsheetUrl || '').trim(),
      pdfFolderId: (cfg.pdfFolderId || '').trim(),
      autoSync: !!cfg.autoSync
    };
  }

  function setSyncStatus(patch) {
    const current = safeParse(localStorage.getItem(STATUS_KEY) || '{}', {});
    const next = Object.assign({}, current, patch, {
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(STATUS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('google-sync-status', { detail: next }));
  }

  function getBaseUrl() {
    const cfg = readConnection();
    if (!cfg.appsScriptUrl) throw new Error('Apps Script URL puudub');
    return cfg.appsScriptUrl;
  }

  async function getJson(url) {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const text = await res.text();
    return JSON.parse(text);
  }

  async function postForm(action, dataObj) {
    const url = getBaseUrl();
    const params = new URLSearchParams();
    params.set('action', action);
    params.set('data', JSON.stringify(dataObj || {}));

    const res = await fetch(url, {
      method: 'POST',
      body: params
    });

    const text = await res.text();
    return JSON.parse(text);
  }

  async function ping() {
    setSyncStatus({ state: 'testing', reason: 'manual', message: 'Ühenduse test...' });
    const data = await getJson(getBaseUrl() + '?action=ping&_ts=' + Date.now());

    if (!data.ok) throw new Error(data.message || 'Ping ebaõnnestus');

    setSyncStatus({
      state: 'ok',
      reason: 'manual',
      message: data.message || 'pong',
      checked: true,
      sheets: []
    });

    return data;
  }

  async function bootstrap() {
    const cfg = readConnection();
    if (cfg.mode !== 'google') return null;

    setSyncStatus({ state: 'syncing', reason: 'bootstrap', message: 'Andmete laadimine...' });

    const data = await getJson(getBaseUrl() + '?action=bootstrap&_ts=' + Date.now());

    if (!data.ok || !data.data) throw new Error(data.message || 'Bootstrap ebaõnnestus');

    localStorage.setItem('toorained_data_v6_3', JSON.stringify(data.data.toorained || []));
    localStorage.setItem('tarnijad_data_v6_3', JSON.stringify(data.data.tarnijad || []));
    localStorage.setItem('logs_data_v6_3', JSON.stringify(data.data.logs || []));
    localStorage.setItem('internal_notes_v6_3', JSON.stringify(data.data.internalNotes || []));
    localStorage.setItem('presence_data_v6_3', JSON.stringify(data.data.presence || []));

    setSyncStatus({
      state: 'ok',
      reason: 'bootstrap',
      message: 'Andmed laaditud',
      checked: true,
      sheets: Object.keys(data.data)
    });

    return data.data;
  }

  async function syncSingle(type, payload) {
    const cfg = readConnection();
    if (cfg.mode !== 'google') {
      return { ok: false, skipped: true, message: 'Google režiim ei ole aktiivne' };
    }

    setSyncStatus({ state: 'syncing', reason: type, message: 'Sünkroonimine...' });

    let result;

    if (type === 'tooraine-save') result = await postForm('upsertTooraine', payload);
    else if (type === 'tooraine-delete') result = await postForm('deleteTooraine', { id: payload.id });
    else if (type === 'tarnija-save') result = await postForm('upsertTarnija', payload);
    else if (type === 'tarnija-delete') result = await postForm('deleteTarnija', { id: payload.id });
    else if (type === 'log-append') result = await postForm('appendLog', payload);
    else if (type === 'internal-note') result = await postForm('addInternalNote', payload);
    else if (type === 'presence') result = await postForm('savePresence', payload);
    else throw new Error('Tundmatu sync tüüp: ' + type);

    if (!result.ok) throw new Error(result.message || 'Sünkroonimine ebaõnnestus');

    setSyncStatus({
      state: 'ok',
      reason: type,
      message: 'Sünkroonimine õnnestus',
      checked: true,
      sheets: [result.sheet || 'unknown']
    });

    return result;
  }

  window.GoogleBridge = {
    readConnection,
    setSyncStatus,
    ping,
    bootstrap,
    syncSingle
  };
})();
