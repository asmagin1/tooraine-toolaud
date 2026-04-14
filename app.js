// ===== ПРОСТОЙ РАБОЧИЙ APP.JS =====

(function () {

  const STORE_KEY = 'google_connection_settings_v1';

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function getUrl() {
    const cfg = getConfig();
    if (!cfg.appsScriptUrl) throw new Error('Apps Script URL puudub');
    return cfg.appsScriptUrl;
  }

  function api(action, data) {
    let url = getUrl() + '?action=' + action + '&_ts=' + Date.now();

    if (data) {
      url += '&data=' + encodeURIComponent(JSON.stringify(data));
    }

    return fetch(url)
      .then(r => r.json());
  }

  // ===== ПИНГ =====
  window.testConnection = async function () {
    try {
      const res = await api('ping');
      alert('Ühendus OK: ' + res.message);
    } catch (e) {
      alert('Viga: ' + e.message);
    }
  };

  // ===== ЗАГРУЗКА ДАННЫХ =====
  window.loadData = async function () {
    try {
      const res = await api('bootstrap');

      if (!res.ok) throw new Error(res.message);

      localStorage.setItem('toorained_data_v6_3', JSON.stringify(res.data.toorained || []));
      localStorage.setItem('tarnijad_data_v6_3', JSON.stringify(res.data.tarnijad || []));
      localStorage.setItem('logs_data_v6_3', JSON.stringify(res.data.logs || []));

      console.log('Data loaded');
    } catch (e) {
      console.error(e);
    }
  };

  // ===== СОХРАНЕНИЕ ТОВАРА =====
  window.saveTooraine = async function (row) {
    try {
      const res = await api('upsertTooraine', row);
      console.log('saved', res);
    } catch (e) {
      console.error(e);
    }
  };

  // ===== УДАЛЕНИЕ =====
  window.deleteTooraine = async function (id) {
    try {
      await api('deleteTooraine', { id });
    } catch (e) {
      console.error(e);
    }
  };

  // ===== ЛОГ =====
  window.addLog = async function (row) {
    try {
      await api('appendLog', row);
    } catch (e) {
      console.error(e);
    }
  };

  // ===== NOTE =====
  window.addNote = async function (row) {
    try {
      await api('addInternalNote', row);
    } catch (e) {
      console.error(e);
    }
  };

})();
