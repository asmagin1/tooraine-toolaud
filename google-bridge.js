(function () {
  const STORE_KEY = 'google_connection_settings_v1';
  const STATUS_KEY = 'google_sync_status_v1';

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  function readConnection() {
    const cfg = safeJsonParse(localStorage.getItem(STORE_KEY) || '{}', {});
    return {
      mode: (cfg.mode || 'local').trim(),
      appsScriptUrl: (cfg.appsScriptUrl || '').trim(),
      spreadsheetId: (cfg.spreadsheetId || '').trim(),
      spreadsheetUrl: (cfg.spreadsheetUrl || '').trim(),
      pdfFolderId: (cfg.pdfFolderId || '').trim(),
      autoSync: !!cfg.autoSync
    };
  }

  function writeConnection(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  function setSyncStatus(patch) {
    const current = safeJsonParse(localStorage.getItem(STATUS_KEY) || '{}', {});
    const next = Object.assign({}, current, patch, {
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(STATUS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('google-sync-status', { detail: next }));
  }

  function getSyncStatus() {
    return safeJsonParse(localStorage.getItem(STATUS_KEY) || '{}', {});
  }

  function getBaseUrl() {
    const cfg = readConnection();
    if (!cfg.appsScriptUrl) {
      throw new Error('Apps Script URL puudub');
    }
    return cfg.appsScriptUrl.trim();
  }

  async function getJson(url) {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(text || 'Vigane vastus serverist');
    }
  }

  function buildUrl(action, dataObj) {
    const base = getBaseUrl();
    const url = new URL(base);
    url.searchParams.set('action', action);
    url.searchParams.set('_ts', String(Date.now()));
    if (dataObj !== undefined) {
      url.searchParams.set('data', JSON.stringify(dataObj));
    }
    return url.toString();
  }

  async function ping() {
    setSyncStatus({
      state: 'testing',
      reason: 'manual',
      message: 'Ühenduse test...'
    });

    const data = await getJson(buildUrl('ping'));

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
  }

  async function bootstrap() {
    const cfg = readConnection();
    if (cfg.mode !== 'google') {
      return null;
    }

    setSyncStatus({
      state: 'syncing',
      reason: 'bootstrap',
      message: 'Andmete laadimine Google Sheetsist...'
    });

    const data = await getJson(buildUrl('bootstrap'));

    if (!data || !data.ok || !data.data) {
      throw new Error((data && data.message) || 'Bootstrap ebaõnnestus');
    }

    if (Array.isArray(data.data.toorained)) {
      localStorage.setItem('toorained_data_v6_3', JSON.stringify(data.data.toorained));
    }
    if (Array.isArray(data.data.tarnijad)) {
      localStorage.setItem('tarnijad_data_v6_3', JSON.stringify(data.data.tarnijad));
    }
    if (Array.isArray(data.data.users)) {
      localStorage.setItem('users_data_v6_3', JSON.stringify(data.data.users));
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
    if (Array.isArray(data.data.monthlyPriceSnapshots)) {
      localStorage.setItem('monthly_price_snapshots_v6_3', JSON.stringify(data.data.monthlyPriceSnapshots));
    }

    setSyncStatus({
      state: 'ok',
      reason: 'bootstrap',
      message: 'Andmed laaditud',
      checked: true,
      sheets: Object.keys(data.data)
    });

    return data.data;
  }

  async function saveTooraine(row) {
    const data = await getJson(buildUrl('upsertTooraine', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Tooraine salvestamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'tooraine-save',
      message: 'Tooraine salvestatud',
      checked: true,
      sheets: ['Toorained']
    });
    return data;
  }

  async function deleteTooraine(id) {
    const data = await getJson(buildUrl('deleteTooraine', { id }));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Tooraine kustutamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'tooraine-delete',
      message: 'Tooraine kustutatud',
      checked: true,
      sheets: ['Toorained']
    });
    return data;
  }

  async function saveTarnija(row) {
    const data = await getJson(buildUrl('upsertTarnija', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Tarnija salvestamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'tarnija-save',
      message: 'Tarnija salvestatud',
      checked: true,
      sheets: ['Tarnijad']
    });
    return data;
  }

  async function deleteTarnija(id) {
    const data = await getJson(buildUrl('deleteTarnija', { id }));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Tarnija kustutamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'tarnija-delete',
      message: 'Tarnija kustutatud',
      checked: true,
      sheets: ['Tarnijad']
    });
    return data;
  }

  async function appendLog(row) {
    const data = await getJson(buildUrl('appendLog', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Logi lisamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'log-append',
      message: 'Logi lisatud',
      checked: true,
      sheets: ['Logs']
    });
    return data;
  }

  async function addInternalNote(row) {
    const data = await getJson(buildUrl('addInternalNote', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Märkme lisamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'internal-note',
      message: 'Märkus lisatud',
      checked: true,
      sheets: ['InternalNotes']
    });
    return data;
  }

  async function savePresence(row) {
    const data = await getJson(buildUrl('savePresence', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Presence salvestamine ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'presence',
      message: 'Presence uuendatud',
      checked: true,
      sheets: ['Presence']
    });
    return data;
  }

  async function saveMonthlyPriceSnapshot(row) {
    const data = await getJson(buildUrl('saveMonthlyPriceSnapshot', row));
    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Kuu hinnasnapshot ebaõnnestus');
    }
    setSyncStatus({
      state: 'ok',
      reason: 'monthly-price-snapshot',
      message: 'Kuu hinnasnapshot salvestatud',
      checked: true,
      sheets: ['MonthlyPriceSnapshots']
    });
    return data;
  }

  async function syncSingle(type, payload) {
    const cfg = readConnection();

    if (cfg.mode !== 'google') {
      return { ok: false, skipped: true, message: 'Google režiim ei ole aktiivne' };
    }

    setSyncStatus({
      state: 'syncing',
      reason: type,
      message: 'Sünkroonimine...'
    });

    switch (type) {
      case 'tooraine-save':
        return saveTooraine(payload);
      case 'tooraine-delete':
        return deleteTooraine(payload.id);
      case 'tarnija-save':
        return saveTarnija(payload);
      case 'tarnija-delete':
        return deleteTarnija(payload.id);
      case 'log-append':
        return appendLog(payload);
      case 'internal-note':
        return addInternalNote(payload);
      case 'presence':
        return savePresence(payload);
      case 'monthly-price-snapshot':
        return saveMonthlyPriceSnapshot(payload);
      default:
        throw new Error('Tundmatu syncSingle tüüp: ' + type);
    }
  }


    return setInterval(async function () {
      try {
        const row = typeof buildPresenceRow === 'function' ? buildPresenceRow() : null;
        if (!row) return;
        await savePresence(row);
      } catch (err) {
        setSyncStatus({
          state: 'error',
          reason: 'presence',
          message: err.message || String(err),
          checked: false,
          sheets: []
        });
      }
    }, 120000);
  }

  window.GoogleBridge = {
    readConnection,
    writeConnection,
    getSyncStatus,
    setSyncStatus,
    ping,
    bootstrap,
    syncSingle,
    saveTooraine,
    deleteTooraine,
    saveTarnija,
    deleteTarnija,
    appendLog,
    addInternalNote,
    savePresence,
    saveMonthlyPriceSnapshot,
  };
})();
