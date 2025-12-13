// --- НАЧАЛО: Логика "Что нового" ---
const CURRENT_VERSION = '1.1'; // Измените на актуальную версию вашего приложения
const VERSION_KEY = 'kml_generator_app_version';

// Функция для инициализации проверки версии и отображения модального окна
function initializeWhatsNew() {
    // Проверить версию при загрузке
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== CURRENT_VERSION) {
        // Версия изменилась, показать окно "Что нового"
        // Ждем, пока DOM будет полностью загружен, если функция вызывается до этого
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showWhatsNewModal);
        } else {
            // Если DOM уже загружен, вызываем сразу
            showWhatsNewModal();
        }
    }
}

function showWhatsNewModal() {
    const modal = document.getElementById('whatsNewModal');
    const backdrop = document.getElementById('whatsNewModalBackdrop');
    const closeBtn = document.getElementById('whatsNewClose');

    // Проверка, существуют ли элементы (на случай, если HTML не загружен)
    if (!modal || !backdrop) {
        console.error('Элементы модального окна "Что нового" не найдены.');
        return;
    }

    // Показать модальное окно
    backdrop.style.display = 'block';
    modal.style.display = 'block';
    setTimeout(() => {
        backdrop.classList.add('show');
        modal.classList.add('show');
    }, 0);

    // Обработчики закрытия
    const handleClose = () => {
        modal.classList.remove('show');
        backdrop.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            backdrop.style.display = 'none';
        }, 300);

        // Сохранить текущую версию в localStorage после закрытия
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    };

    closeBtn?.addEventListener('click', handleClose);
    backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) {
            handleClose();
        }
    });
}

// Запускаем инициализацию
initializeWhatsNew();
// --- КОНЕЦ: Логика "Что нового" ---