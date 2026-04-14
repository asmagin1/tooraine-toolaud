(function () {
  const STORE_KEY = 'google_connection_settings_v1';
  let autosyncTimer = null;
  let heartbeatTimer = null;

  function readConnection() {
    try {
      const fromLs = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        mode: fromLs.mode || 'local',
        appsScriptUrl: (fromLs.appsScriptUrl || '').trim(),
        spreadsheetId: (fromLs.spreadsheetId || '').trim(),
        spreadsheetUrl: (fromLs.spreadsheetUrl || '').trim(),
        pdfFolderId: (fromLs.pdfFolderId || '').trim(),
        autoSync: !!fromLs.autoSync
      };
    } catch (e) {
      return { mode: 'local', appsScriptUrl: '', spreadsheetId: '', spreadsheetUrl: '', pdfFolderId: '', autoSync: false };
    }
  }

  function setSyncStatus(patch) {
    const current = JSON.parse(localStorage.getItem('google_sync_status_v1') || '{}');
    const next = Object.assign({}, current, patch, { timestamp: new Date().toISOString() });
    localStorage.setItem('google_sync_status_v1', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('google-sync-status', { detail: next }));
  }

  async function getPing(url) {
    const res = await fetch(url + '?action=ping&_ts=' + Date.now(), {
      method: 'GET',
      cache: 'no-store'
    });
    return res.json();
  }

  async function getBootstrap(url) {
    const res = await fetch(url + '?action=bootstrap&_ts=' + Date.now(), {
      method: 'GET',
      cache: 'no-store'
    });
    return res.json();
  }

  async function postForm(url, action, payload) {
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('data', JSON.stringify(payload || {}));

    const res = await fetch(url, {
      method: 'POST',
      body: body
    });

    return res.json();
  }

  function buildPayload() {
    return {
      toorained: JSON.parse(localStorage.getItem('toorained_data_v6_3') || '[]'),
      tarnijad: JSON.parse(localStorage.getItem('tarnijad_data_v6_3') || '[]'),
      users: JSON.parse(localStorage.getItem('users_data_v6_3') || '[]'),
      logs: JSON.parse(localStorage.getItem('logs_data_v6_3') || '[]'),
      settings: JSON.parse(localStorage.getItem('settings_data_v6_3') || '[]'),
      generatedFiles: JSON.parse(localStorage.getItem('generated_files_v6_3') || '[]'),
      monthlyPriceSnapshots: JSON.parse(localStorage.getItem('monthly_price_snapshots_v6_3') || '[]'),
      internalNotes: JSON.parse(localStorage.getItem('internal_notes_v6_3') || '[]'),
      presence: JSON.parse(localStorage.getItem('presence_data_v6_3') || '[]')
    };
  }

  async function testConnection() {
    const cfg = readConnection();
    if (!cfg.appsScriptUrl) throw new Error('Apps Script URL puudub');

    setSyncStatus({ state: 'testing', reason: 'manual' });
    const data = await getPing(cfg.appsScriptUrl);

    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Ping ebaõnnestus');
    }

    setSyncStatus({
      state: 'ok',
      message: data.message || 'pong',
      reason: 'manual',
      checked: true,
      sheets: []
    });

    return data;
  }

  async function syncNow(reason) {
    const cfg = readConnection();
    if (cfg.mode !== 'google') {
      setSyncStatus({ state: 'idle', reason: reason || 'manual', message: 'Google režiim ei ole aktiivne' });
      return { ok: false, message: 'Google mode disabled' };
    }
    if (!cfg.appsScriptUrl) {
      throw new Error('Apps Script URL puudub');
    }

    setSyncStatus({ state: 'syncing', reason: reason || 'manual' });

    const payload = buildPayload();
    const data = await postForm(cfg.appsScriptUrl, 'saveAll', payload);

    if (!data || !data.ok) {
      throw new Error((data && data.message) || 'Sünkroonimine ebaõnnestus');
    }

    setSyncStatus({
      state: 'ok',
      message: data.message || 'Salvestatud',
      reason: reason || 'manual',
      checked: !!data.checked,
      sheets: (data.written || []).map(x => x.sheet),
      counts: data.counts || {}
    });

    return data;
  }

  function queueAutosync(reason) {
    const cfg = readConnection();
    if (cfg.mode !== 'google' || !cfg.autoSync) return;

    clearTimeout(autosyncTimer);
    autosyncTimer = setTimeout(() => {
      syncNow(reason || 'autosave').catch(err => {
        setSyncStatus({
          state: 'error',
          message: err.message || String(err),
          reason: reason || 'autosave',
          checked: false,
          sheets: []
        });
      });
    }, 10000);
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    const cfg = readConnection();
    if (cfg.mode !== 'google' || !cfg.autoSync) return;

    heartbeatTimer = setInterval(() => {
      syncNow('heartbeat').catch(err => {
        setSyncStatus({
          state: 'error',
          message: err.message || String(err),
          reason: 'heartbeat',
          checked: false,
          sheets: []
        });
      });
    }, 90000);
  }

  async function bootstrapFromGoogle() {
    const cfg = readConnection();
    if (cfg.mode !== 'google' || !cfg.appsScriptUrl) return null;

    const data = await getBootstrap(cfg.appsScriptUrl);
    if (!data || !data.ok || !data.data) {
      throw new Error((data && data.message) || 'Bootstrap ebaõnnestus');
    }

    localStorage.setItem('toorained_data_v6_3', JSON.stringify(data.data.toorained || []));
    localStorage.setItem('tarnijad_data_v6_3', JSON.stringify(data.data.tarnijad || []));
    localStorage.setItem('users_data_v6_3', JSON.stringify(data.data.users || []));
    localStorage.setItem('logs_data_v6_3', JSON.stringify(data.data.logs || []));
    localStorage.setItem('settings_data_v6_3', JSON.stringify(data.data.settings || []));
    localStorage.setItem('generated_files_v6_3', JSON.stringify(data.data.generatedFiles || []));
    localStorage.setItem('monthly_price_snapshots_v6_3', JSON.stringify(data.data.monthlyPriceSnapshots || []));
    localStorage.setItem('internal_notes_v6_3', JSON.stringify(data.data.internalNotes || []));
    localStorage.setItem('presence_data_v6_3', JSON.stringify(data.data.presence || []));

    setSyncStatus({
      state: 'ok',
      message: 'Bootstrap laaditud',
      reason: 'bootstrap',
      checked: true,
      sheets: Object.keys(data.data)
    });

    return data.data;
  }

  window.GoogleBridge = {
    readConnection,
    testConnection,
    syncNow,
    queueAutosync,
    startHeartbeat,
    bootstrapFromGoogle
  };

  window.addEventListener('beforeunload', function () {
    // ничего не делаем: unload-синхронизация ненадежна
  });
})();
