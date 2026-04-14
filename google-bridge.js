(function () {
  const STORE_KEY = 'google_connection_settings_v1';
  const STATUS_KEY = 'google_sync_status_v1';

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  function emitStatus(next) {
    try {
      localStorage.setItem(STATUS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('google-sync-status', { detail: next }));
    } catch (e) {
      console.error('google-sync-status error', e);
    }
  }

  function setSyncStatus(patch) {
    const current = safeParse(localStorage.getItem(STATUS_KEY) || '{}', {});
    const next = Object.assign({}, current, patch, {
      timestamp: new Date().toISOString()
    });
    emitStatus(next);
    return next;
  }

  function readConnection() {
    const cfg = safeParse(localStorage.getItem(STORE_KEY) || '{}', {});
    return {
      mode: typeof cfg.mode === 'string' ? cfg.mode : 'local',
      appsScriptUrl: typeof cfg.appsScriptUrl === 'string' ? cfg.appsScriptUrl.trim() : '',
      spreadsheetId: typeof cfg.spreadsheetId === 'string' ? cfg.spreadsheetId.trim() : '',
      spreadsheetUrl: typeof cfg.spreadsheetUrl === 'string' ? cfg.spreadsheetUrl.trim() : '',
      pdfFolderId: typeof cfg.pdfFolderId === 'string' ? cfg.pdfFolderId.trim() : '',
      autoSync: !!cfg.autoSync
    };
  }

  function writeConnection(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next || {}));
    return true;
  }

  function getBaseUrl() {
    const cfg = readConnection();
    if (!cfg.appsScriptUrl) {
      throw new Error('Apps Script URL puudub');
    }
    return cfg.appsScriptUrl;
  }

  async function readJsonResponse(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(text || 'Vigane serveri vastus');
    }
  }

  async function ping() {
    try {
      setSyncStatus({
        state: 'testing',
        reason: 'manual',
        message: 'Ühenduse test...'
      });

      const url = getBaseUrl() + '?action=ping&_ts=' + Date.now();
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await readJsonResponse(res);

      if (!data || !data.ok) {
        throw new Error((data && data.message) || 'Ping ebaõnnestus');
      }

      setSyncStatus({
        state: 'ok',
        reason: 'manual',
        message: data.message || 'pong',
        checked: true,
        sheets: []
      });

      return data;
    } catch (err) {
      setSyncStatus({
        state: 'error',
        reason: 'manual',
        message: err.message || String(err),
        checked: false,
        sheets: []
      });
      throw err;
    }
  }

  async function bootstrap() {
    try {
      const cfg = readConnection();
      if (cfg.mode !== 'google' || !cfg.appsScriptUrl) {
        return null;
      }

      setSyncStatus({
        state: 'syncing',
        reason: 'bootstrap',
        message: 'Andmete laadimine...'
      });

      const url = getBaseUrl() + '?action=bootstrap&_ts=' + Date.now();
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await readJsonResponse(res);

      if (!data || !data.ok || !data.data) {
        throw new Error((data && data.message) || 'Bootstrap ebaõnnestus');
      }

      if (Array.isArray(data.data.toorained)) {
        localStorage.setItem('toorained_data_v6_3', JSON.stringify(data.data.toorained));
      }
      if (Array.isArray(data.data.tarnijad)) {
        localStorage.setItem('tarnijad_data_v6_3', JSON.stringify(data.data.tarnijad));
      }
      if (Array.isArray(data.data.logs)) {
        localStorage.setItem('logs_data_v6_3', JSON.stringify(data.data.logs));
      }
      if (Array.isArray(data.data.internalNotes)) {
        localStorage.setItem('internal_notes_v6_3', JSON.stringify(data.data.internalNotes));
      }
      if (Array.isArray(data.data.presence)) {
        localStorage.setItem('presence_data_v6_3', JSON.stringify(data.data.presence));
      }

      setSyncStatus({
        state: 'ok',
        reason: 'bootstrap',
        message: 'Andmed laaditud',
        checked: true,
        sheets: Object.keys(data.data)
      });

      return data.data;
    } catch (err) {
      setSyncStatus({
        state: 'error',
        reason: 'bootstrap',
        message: err.message || String(err),
        checked: false,
        sheets: []
      });
      console.error('bootstrap error', err);
      return null;
    }
  }

  async function syncSingle(type, payload) {
    try {
      const cfg = readConnection();

      if (cfg.mode !== 'google') {
        return { ok: false, skipped: true, message: 'Google režiim ei ole aktiivne' };
      }

      const actionMap = {
        'tooraine-save': 'upsertTooraine',
        'tooraine-delete': 'deleteTooraine',
        'tarnija-save': 'upsertTarnija',
        'tarnija-delete': 'deleteTarnija',
        'log-append': 'appendLog',
        'internal-note': 'addInternalNote',
        'presence': 'savePresence'
      };

      const action = actionMap[type];
      if (!action) {
        throw new Error('Tundmatu sync tüüp: ' + type);
      }

      setSyncStatus({
        state: 'syncing',
        reason: type,
        message: 'Sünkroonimine...'
      });

      const params = new URLSearchParams();
      params.set('action', action);
      params.set('data', JSON.stringify(payload || {}));

      const res = await fetch(getBaseUrl(), {
        method: 'POST',
        body: params
      });

      const data = await readJsonResponse(res);

      if (!data || !data.ok) {
        throw new Error((data && data.message) || 'Sünkroonimine ebaõnnestus');
      }

      setSyncStatus({
        state: 'ok',
        reason: type,
        message: 'Sünkroonimine õnnestus',
        checked: true,
        sheets: [data.sheet || action]
      });

      return data;
    } catch (err) {
      setSyncStatus({
        state: 'error',
        reason: type,
        message: err.message || String(err),
        checked: false,
        sheets: []
      });
      console.error('syncSingle error', type, err);
      throw err;
    }
  }

  window.GoogleBridge = {
    readConnection: readConnection,
    writeConnection: writeConnection,
    setSyncStatus: setSyncStatus,
    ping: ping,
    bootstrap: bootstrap,
    syncSingle: syncSingle
  };
})();
