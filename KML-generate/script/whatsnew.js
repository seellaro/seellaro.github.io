/* --------------  НАСТРОЙКИ  -------------- */
const CURRENT_VERSION = '1.2';
const VERSION_KEY     = 'kml_generator_app_version';
const WHATSNEW_HTML   = 'modals/whatsnew.html';   // путь к файлу с разметкой

/* --------------  ЗАГРУЗКА РАЗМЕТКИ  -------------- */
async function loadWhatsNew() {
  try {
    const resp = await fetch(WHATSNEW_HTML);
    if (!resp.ok)  throw new Error(resp.status);
    const html = await resp.text();

    // вставляем разметку в уже существующий контейнер index.html
    document.querySelector('#whatsNewModal .modal-content').innerHTML = html;
    attachEvents();            // вешаем обработчики
    fireIfNeeded();            // проверяем версию и показываем окно
  } catch (e) {
    console.warn('Не удалось загрузить «Что нового»', e);
  }
}

/* --------------  ОБРАБОТЧИКИ ЗАКРЫТИЯ  -------------- */
function attachEvents() {
  const modal   = document.getElementById('whatsNewModal');
  const backdrop= document.getElementById('whatsNewModalBackdrop');
  const closeBtn= document.getElementById('whatsNewClose');
  if (!modal || !backdrop) return;

  function close() {
    modal.classList.remove('show');
    backdrop.classList.remove('show');
    setTimeout(() => {
      modal.style.display   = 'none';
      backdrop.style.display= 'none';
    }, 300);
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
  }

  closeBtn?.addEventListener('click', close);
  backdrop.addEventListener('click', e => e.target === backdrop && close());
}

/* --------------  ПОКАЗ ПРИ ПЕРВОМ ЗАПУСКЕ НОВОЙ ВЕРСИИ  -------------- */
function fireIfNeeded() {
  const stored = localStorage.getItem(VERSION_KEY);
  if (stored === CURRENT_VERSION) return;   // уже видели

  const modal   = document.getElementById('whatsNewModal');
  const backdrop= document.getElementById('whatsNewModalBackdrop');
  if (!modal || !backdrop) return;

  modal.style.display   = 'block';
  backdrop.style.display= 'block';
  setTimeout(() => {
    modal.classList.add('show');
    backdrop.classList.add('show');
  }, 0);
}

/* --------------  ЗАПУСК  -------------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadWhatsNew);
} else {
  loadWhatsNew();
}
