let currentServiceCounts = {};
let currentServiceCountsReserved = {};
let tabsData = [];
let globalSeenServicesAndCodes = {};

// Храним информацию о загруженных файлах для проверок
let loadedFilesInfo = []; // [{name: string, detectedType: 'lp'|'lt'|'cbd'}]

document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    currentServiceCounts = {};
    currentServiceCountsReserved = {};
    tabsData = [];
    globalSeenServicesAndCodes = {};
    loadedFilesInfo = [];
    updateTabsDisplay();
}

let forcedMode = 'auto';

function setupEventListeners() {
    const loadBtn = document.getElementById('universal-load-button');
    const contextMenu = document.getElementById('context-menu');

    // Левый клик — всегда загрузка в текущем выбранном режиме
    loadBtn.addEventListener('click', () => {
        openFilesWithMode(forcedMode);
    });

    // Правая кнопка — открываем контекстное меню
    loadBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const btnRect = loadBtn.getBoundingClientRect();
        const menuWidth = 240;
        const menuHeight = contextMenu.offsetHeight || 180;

        let left = btnRect.left + btnRect.width / 2 - menuWidth / 2;
        let top = btnRect.bottom + 8;

        // Корректировка, чтобы не вылезало за экран
        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;
        if (top + menuHeight > window.innerHeight) top = btnRect.top - menuHeight - 8;

        contextMenu.style.left = `${left}px`;
        contextMenu.style.top = `${top}px`;
        contextMenu.style.display = 'block';
    });

    // Выбор пункта меню
    contextMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            forcedMode = item.getAttribute('data-mode');

            // === НОВАЯ ЧАСТЬ: меняем текст кнопки ===
            const modeTexts = {
                'auto': 'Загрузка файлов (Авто)',
                'lp': 'Загрузка файлов (Только ЛП)',
                'lt': 'Загрузка файлов (Только ЛТ)',
                'cbd': 'Загрузка файлов (Только ЦБД)'
            };
            loadBtn.textContent = modeTexts[forcedMode];
            // ======================================

            // Подсвечиваем выбранный пункт (опционально)
            contextMenu.querySelectorAll('.menu-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            contextMenu.style.display = 'none';

            // Запускаем загрузку в выбранном режиме
            openFilesWithMode(forcedMode);
        });
    });

    // Закрытие меню при клике вне его и кнопки
    document.addEventListener('click', (e) => {
        if (!loadBtn.contains(e.target) && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    // Закрытие по Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            contextMenu.style.display = 'none';
        }
    });

    // Экспорт
    document.getElementById('export-button').addEventListener('click', exportData);
}




// === ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ===
function openFilesWithMode(mode = 'auto') {
    let input = document.getElementById('hidden-file-input');
    if (!input) {
        input = document.createElement('input');
        input.id = 'hidden-file-input';
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);
    }

    input.onchange = null;

    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        initializeApp();

        const processingResults = [];
        let hasCriticalError = false;

        for (const file of files) {
            try {
                if (mode !== 'auto') {
                    // Режим "Только ЛП / Только ЛТ / Только ЦБД"
                    const detected = await detectFileType(file);
                    if (detected !== mode) {
                        const userChoice = confirm(
                            `Файл "${file.name}" — определён как ${formatType(detected).toUpperCase()}, а выбран режим "${formatType(mode).toUpperCase()}"\n\n` +
                            `Всё равно загрузить как ${formatType(mode).toUpperCase()}?`
                        );
                        if (!userChoice) {
                            processingResults.push(`⚠ ${file.name} — пропущен (не соответствует режиму)`);
                            continue;
                        }
                    }
                    await processFile(file, mode);
                    loadedFilesInfo.push({ name: file.name, detectedType: mode });
                    processingResults.push(`✔ ${file.name} — загружен как ${formatType(mode)}())}`);
                } else {
                    // Автоопределение
                    const detected = await detectFileType(file);
                    await processFile(file, detected);
                    loadedFilesInfo.push({ name: file.name, detectedType: detected });
                    processingResults.push(`✔ ${file.name} — ${formatType(detected)}`);
                }
            } catch (err) {
                hasCriticalError = true;
                processingResults.push(`✖ ${file.name} — ОШИБКА: ${err.message}`);
                console.error(`Ошибка обработки файла ${file.name}:`, err);
            }
        }

        // === Проверка однотипности в авторежиме ===
        if (mode === 'auto' && loadedFilesInfo.length > 1) {
            const counts = {};
            loadedFilesInfo.forEach(f => counts[f.detectedType] = (counts[f.detectedType] || 0) + 1);
            const maxCount = Math.max(...Object.values(counts));
            const majorityType = Object.keys(counts).find(t => counts[t] === maxCount);

            const mismatched = loadedFilesInfo.filter(f => f.detectedType !== majorityType);

            if (mismatched.length > 0) {
                hasCriticalError = true;
                const list = mismatched.map(f => `• ${f.name} → ${formatType(f.detectedType).toUpperCase()}`).join('\n');
                processingResults.push(
                    `\n⚠ Обнаружены файлы другого типа!\n` +
                    `Большинство файлов: ${formatType(majorityType).toUpperCase()} (${maxCount} из ${loadedFilesInfo.length})\n` +
                    `Отличающиеся:\n${list}\n\n` +
                    `Они будут пропущены.`
                );
                // Удаляем их из обработки
                loadedFilesInfo = loadedFilesInfo.filter(f => f.detectedType === majorityType);
            }
        }

        // Генерация результата
        generateTabsContent(currentServiceCounts, currentServiceCountsReserved);
        updateTabsDisplay();

        // Уведомление ТОЛЬКО при ошибках или предупреждениях
        const finalMessage = processingResults.join('\n');
        if (hasCriticalError || processingResults.some(r => r.includes('пропущен') || r.includes('ОШИБКА'))) {
            alert(finalMessage);
        }
        // Если всё ок — тишина (как ты и хотел)
    };

    input.click();
}

// === Отдельная функция определения типа (надёжная) ===
async function detectFileType(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0].toLowerCase();
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                if (!firstSheet || !firstSheet['!ref']) {
                    console.warn(`[Тип] ${file.name} → пустой → ЛП`);
                    return resolve('lp');
                }

                const range = XLSX.utils.decode_range(firstSheet['!ref']);
                range.e.r = Math.min(range.e.r, 39);
                const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", range: XLSX.utils.encode_range(range) });

                const allCellsLower = json.flat().map(c => String(c || "").trim().toLowerCase());

                console.group(`%c[Определение типа] ${file.name}`, 'color: #00d0ff; font-weight: bold');

                // 1. ЦБД — первый и главный
                if (allCellsLower.some(c => c === 'код' || c.includes('код'))) {
                    console.log(`%c→ ЦБД (найден заголовок "Код")`, 'color: lime; font-weight: bold');
                    console.groupEnd();
                    return resolve('cbd');
                }

                // 2. ЛП — проверяем ЯВНЫЕ признаки ЛП ДО ЛТ!
                const lpProof = allCellsLower.some(c =>
                    c.includes('пс1') || c.includes('пс2') ||
                    c.includes('емкость stm') || c.includes('занято stm') ||
                    c.includes('свободно stm') || c.includes('вид услуги')
                );

                if (lpProof) {
                    console.log(`%c→ ЛП (найдены ПС1/ПС2, STM, "Вид услуги" и т.д.)`, 'color: cyan; font-weight: bold');
                    console.groupEnd();
                    return resolve('lp');
                }

                // 3. Только теперь проверяем ЛТ (чтобы ЛП с упоминанием WDM не попал сюда)
                const ltHeaders = ['резервирование', 'разнесение', 'есть резерв', 'влс', 'ур', 'мно', 'ви/вс'];
                const hasLTHeader = allCellsLower.some(c => ltHeaders.some(h => c.includes(h)));

                // WDM в ЛТ-файлах почти всегда в названии листа + есть слово "маршрут"
                const hasRealWDM = (firstSheetName.includes('wdm') || allCellsLower.some(c => c.includes('wdm')))
                    && allCellsLower.some(c => c.includes('маршрут'));

                if (hasLTHeader || hasRealWDM) {
                    console.log(`%c→ ЛТ (ЛТ-заголовки или WDM + "маршрут")`, 'color: yellow; font-weight: bold');
                    console.groupEnd();
                    return resolve('lt');
                }

                // Если ничего не подошло
                console.warn(`%c→ Неизвестный тип — считаем ЛП`, 'color: orange');
                console.groupEnd();
                resolve('lp');

            } catch (err) {
                console.error(`[Ошибка] ${file.name}:`, err);
                console.groupEnd();
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения'));
        reader.readAsArrayBuffer(file);
    });
}

function formatType(type) {
    return type === 'lp' ? 'ЛП' : type === 'lt' ? 'ЛТ' : 'ЦБД';
}

// === processFile — без изменений (работает корректно) ===
// (весь остальной код processLPData / processLTData / processCBDData и ниже — оставляем как был)

function processFile(file, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (type === 'lp') processLPData(jsonData);
                else if (type === 'lt') processLTData(jsonData);
                else if (type === 'cbd') processCBDData(jsonData);

                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsArrayBuffer(file);
    });
}


// --- ИЗМЕНЕНО: processFile НЕ передает seen_services/codes ---
function processFile(file, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (type === 'lp') {
                    processLPData(jsonData);
                } else if (type === 'lt') {
                    processLTData(jsonData);
                } else if (type === 'cbd') {
                    processCBDData(jsonData);
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsArrayBuffer(file);
    });
}

// --- Функции обработки данных ---
// --- ИЗМЕНЕНО: processLPData использует globalSeenServicesAndCodes ---
function processLPData(data) {
    // Helper functions
    function is_na(value) {
        return value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
    }
    function not_na(value) {
        return !is_na(value);
    }

    // Инициализация структуры данных ЛОКАЛЬНО
    let serviceCounts = {
        'ОК': {}, '100 ГБит/с': {}, '10 ГБит/с': {}, '2.5 ГБит/с': {},
        '1 ГБит/с': {}, '155 МБит/с': {}, '45 МБит/с': {}, '2 МБит/с': {},
        'Спец': {}, 'Тёмные ОВ': {}
    };

    // Начинаем перебор строк, начиная с индекса 1 (пропускаем заголовки)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // Получаем значения столбцов
        let service_value = row[0]; // A
        let additional_value = row[13]; // N
        const status_value = row[10]; // K
        const column_l_value = row[11]; // L
        const column_m_value = row[12]; // M
        // D-I (3-8)
        const columns_d_to_i = row.slice(3, 9);
        const all_dash = columns_d_to_i.every(cell => String(cell).trim() === '-');
        const vzs_check = String(additional_value).includes('ВЗС');

        // Проверка, если L, M и N пустые
        if (is_na(column_l_value) && is_na(column_m_value) && is_na(additional_value)) {
            continue;
        }

        // --- ПРОВЕРКА НА ДУБЛИКАТ ---
        // Используем значение из столбца L как идентификатор для LP
        const uniqueId = String(column_l_value);
        if (globalSeenServicesAndCodes[uniqueId]) {
            continue; // Пропускаем, если уже видели
        }
        globalSeenServicesAndCodes[uniqueId] = true; // Отмечаем как виденный
        // --- КОНЕЦ ПРОВЕРКИ ---

        // Проверка на "Действующее" и отсутствие "РЕЗ"
        if (typeof status_value === 'string' && status_value.trim() === "Действующее" && typeof service_value === 'string' && !String(additional_value).includes('РЕЗ')) {
            let primary_service = null;
            // Логика для ОК
            if (String(service_value).includes("OC") && (not_na(column_m_value) || not_na(additional_value))) {
                primary_service = 'ОК';
            }
            // Логика для OTU4
            if (String(service_value).includes("OTU4")) {
                if (!(is_na(column_m_value) && is_na(additional_value))) {
                    primary_service = '100 ГБит/с';
                }
            }
            // Логика для OTU2
            else if (String(service_value).includes("OTU2")) {
                if (!(is_na(column_m_value) && is_na(additional_value))) {
                    primary_service = '10 ГБит/с';
                }
            }
            // Логика для 100G.
            if (String(service_value).includes("100G.")) {
                if (!(is_na(column_m_value) && is_na(additional_value))) {
                    primary_service = '100 ГБит/с';
                }
            }
            // Логика для 10G.
            else if (String(service_value).includes("10G.")) {
                if (!(is_na(column_m_value) && is_na(additional_value))) {
                    primary_service = '10 ГБит/с';
                }
            }
            if (primary_service === null) {
                if (String(service_value).includes('100GE.')) primary_service = '100 ГБит/с';
                else if (String(service_value).includes('10GE.')) primary_service = '10 ГБит/с';
                else if ((String(service_value).includes('S16.') || String(service_value).includes('c4*16.'))) {
                    primary_service = '2.5 ГБит/с';
                    if (is_na(column_m_value) && is_na(additional_value)) continue;
                }
                else if (String(service_value).includes('VC4')) {
                    primary_service = '155 МБит/с';
                    if (is_na(column_m_value) && is_na(additional_value)) continue;
                }
                else if (String(service_value).includes('VC3')) primary_service = '45 МБит/с';
                else if ((String(service_value).includes('VC12') || String(service_value).includes('E1'))) {
                    if (is_na(column_m_value) && is_na(additional_value)) {
                        additional_value = "ПЦТ";
                    }
                    primary_service = '2 МБит/с';
                }
                else if (String(service_value).includes('S64')) {
                    primary_service = '10 ГБит/с';
                    if (is_na(column_m_value) && is_na(additional_value)) continue;
                }
                else if (String(service_value).includes('GE.') && !String(service_value).includes('100GE') && !String(service_value).includes('10GE')) {
                    primary_service = '1 ГБит/с';
                    if (is_na(column_m_value) && is_na(additional_value)) continue;
                }
            }
            // Функция подсчета ОВ
            function count_services(service_str) {
                const match = service_str.match(/\((.*?)\)/);
                if (match) {
                    const content = match[1];
                    if (content.includes(',')) return 2;
                }
                return 1;
            }
            // Условие вывода для Тёмные ОВ
            if (all_dash && !vzs_check && (not_na(service_value) && String(service_value).includes('(') && (not_na(column_m_value) || not_na(additional_value)) && !String(service_value).includes('Г1') && !String(service_value).includes('Г2'))) {
                const service_main = String(service_value).split(')')[0].trim();
                let display_value;
                if (is_na(additional_value)) {
                    display_value = `${String(service_value)} ()`;
                } else {
                    display_value = not_na(column_m_value) ? `${String(additional_value)} (${String(column_m_value)})_ ${service_main})` : `${String(additional_value)} ()_ ${service_main})`;
                }
                if (!serviceCounts['Тёмные ОВ'].hasOwnProperty(display_value)) {
                    serviceCounts['Тёмные ОВ'][display_value] = 0;
                }
                serviceCounts['Тёмные ОВ'][display_value] += count_services(String(service_value));
            }
            // Условие вывода для ГС
            if (
                (not_na(service_value)) &&
                (String(service_value).includes('Г1') || String(service_value).includes('Г2')) &&
                (not_na(column_m_value) || not_na(additional_value))
            ) {
                const service_main = String(service_value).split(')')[0].trim();
                let display_value;
                if (not_na(additional_value)) {
                    const prefix = String(additional_value).startsWith('ГС') ? 'Спецпользователь' : String(additional_value);
                    display_value = `${prefix} ${service_main})`;
                } else {
                    display_value = service_main;
                }
                if (!serviceCounts['Спец'].hasOwnProperty(display_value)) {
                    serviceCounts['Спец'][display_value] = 0;
                }
                serviceCounts['Спец'][display_value] += count_services(String(service_value));
            }
            if (primary_service) {
                let display_value = "";
                if (not_na(additional_value)) {
                    if (not_na(column_m_value)) {
                        display_value = `${String(additional_value)} (${String(column_m_value)})`;
                    } else {
                        display_value = `${String(additional_value)} ()`;
                    }
                } else if (not_na(column_m_value)) {
                    display_value = `${String(column_m_value)} (${String(column_m_value)})`;
                } else {
                    display_value = "";
                }
                if (display_value) {
                    if (!serviceCounts[primary_service].hasOwnProperty(display_value)) {
                        serviceCounts[primary_service][display_value] = 0;
                    }
                    serviceCounts[primary_service][display_value] += 1;
                }
            }
        }
    }
    // --- ИСПРАВЛЕНО ---
    // Объединяем данные из локального serviceCounts в глобальный currentServiceCounts
    for (let serviceType in serviceCounts) {
        if (!currentServiceCounts[serviceType]) {
            currentServiceCounts[serviceType] = {}; // Инициализируем, если не существует
        }
        for (let displayValue in serviceCounts[serviceType]) {
            if (!currentServiceCounts[serviceType].hasOwnProperty(displayValue)) {
                currentServiceCounts[serviceType][displayValue] = 0;
            }
            currentServiceCounts[serviceType][displayValue] += serviceCounts[serviceType][displayValue];
        }
    }
    // currentServiceCountsReserved остаётся пустым для ЛП, очищаем его на всякий случай
    for (let key in currentServiceCountsReserved) {
        delete currentServiceCountsReserved[key];
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
}

// --- ИЗМЕНЕНО: processLTData использует globalSeenServicesAndCodes ---
function processLTData(data) {
    // Helper functions
    function is_na(value) {
        return value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
    }
    function not_na(value) {
        return !is_na(value);
    }

    // Инициализация структуры данных ЛОКАЛЬНО
    let serviceCounts = {
        'ОК': {}, '100 ГБит/с': {}, '10 ГБит/с': {}, '2.5 ГБит/с': {},
        '155 МБит/с': {}, '45 МБит/с': {}, '2 МБит/с': {}, '1 ГБит/с': {},
        'Спец': {}, 'Тёмные ОВ': {}
    };
    let serviceCountsReserved = {
        'ОК': {}, '100 ГБит/с': {}, '10 ГБит/с': {}, '2.5 ГБит/с': {},
        '155 МБит/с': {}, '45 МБит/с': {}, '2 МБит/с': {}, '1 ГБит/с': {},
        'Спец': {}, 'Тёмные ОВ': {}
    };

    // Обработка резерва (аналогично Python)
    let reserved = "";
    const len_of_df = data.length;
    let olp_reserved = 0;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        let service_value = row[0];
        let additional_value = row[10];
        const status_value = row[2];
        const column_j_value = row[9];
        const column_m_value = row[12];
        const reserve_status_raw = row[17]; // R (18-й столбец, индекс 17)

        // Проверка WDM и "Есть резерв"
        if (not_na(service_value) && String(service_value).includes("WDM") && String(reserve_status_raw) === "Есть резерв") {
            olp_reserved = 1;
        }

        // Проверка OC. и "Есть резерв" с пропуском следующей строки OC.
        if (i < len_of_df - 1) { // Убедимся, что следующая строка существует
            const next_row = data[i + 1];
            const next_sv = next_row[0];
            const next_is_oc = not_na(next_sv) && String(next_sv).includes("OC.");
            if (not_na(service_value) && String(service_value).includes("OC.") && String(reserve_status_raw) === "Есть резерв" && !next_is_oc) {
                reserved = "Есть резерв";
            } else if (next_is_oc) {
                data[i][17] = reserved; // Присваиваем значение из предыдущей итерации
                reserved = undefined; // Сбрасываем
            }
        }
        if (olp_reserved === 1) {
            reserved = "Есть резерв";
        }
        if (reserved === "Есть резерв") {
            data[i][17] = reserved; // Присваиваем текущей строке
        }

        // --- Основная логика обработки строки ---
        if (is_na(column_j_value) && is_na(column_m_value) && is_na(additional_value)) {
            continue;
        }

        // --- ПРОВЕРКА НА ДУБЛИКАТ ---
        // Используем значение из столбца J как идентификатор для LT
        const uniqueId = String(column_j_value);
        if (globalSeenServicesAndCodes[uniqueId]) {
            continue; // Пропускаем, если уже видели
        }
        globalSeenServicesAndCodes[uniqueId] = true; // Отмечаем как виденный
        // --- КОНЕЦ ПРОВЕРКИ ---

        // Проверка статуса и отсутствия "РЕЗ"
        if (typeof status_value === 'string' && status_value.trim() === "Д" && typeof service_value === 'string' && !String(additional_value).includes('РЕЗ')) {
            let primary_service = null;
            const is_reserved = String(data[i][17]) === "Есть резерв"; // Проверяем резерв для текущей строки
            let target_counts = is_reserved ? serviceCountsReserved : serviceCounts;
            if (is_reserved) {
                // --- Обработка ЗАРЕЗЕРВИРОВАННЫХ ---
                if (String(service_value).includes("OC") && (not_na(column_m_value) || not_na(additional_value))) {
                    primary_service = 'ОК';
                }
                if (String(service_value).includes("OTU4")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '100 ГБит/с';
                    }
                }
                else if (String(service_value).includes("OTU2")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '10 ГБит/с';
                    }
                }
                if (String(service_value).includes("100G.")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '100 ГБит/с';
                    }
                }
                else if (String(service_value).includes("10G.")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '10 ГБит/с';
                    }
                }
                if (primary_service === null) {
                    if (String(service_value).includes('100GE')) primary_service = '100 ГБит/с';
                    else if (String(service_value).includes('10GE')) primary_service = '10 ГБит/с';
                    else if ((String(service_value).includes('S16.') || String(service_value).includes('c4*16.'))) {
                        primary_service = '2.5 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('VC4')) {
                        primary_service = '155 МБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('VC3')) primary_service = '45 МБит/с';
                    else if ((String(service_value).includes('VC12') || String(service_value).includes('E1'))) {
                        if (is_na(column_m_value) && is_na(additional_value)) {
                            additional_value = "ПЦТ";
                        }
                        primary_service = '2 МБит/с';
                    }
                    else if (String(service_value).includes('S64')) {
                        primary_service = '10 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('GE') && !String(service_value).includes('100GE') && !String(service_value).includes('10GE')) {
                        primary_service = '1 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                }
                // Тёмные ОВ и Спец для зарезервированных
                if ((not_na(service_value) && String(service_value).includes('(') && (not_na(column_m_value) || not_na(additional_value)) && !['Г1', 'Г2'].some(g => String(service_value).includes(g)))) {
                    let display_value;
                    if (is_na(additional_value)) {
                        display_value = `${String(service_value)} ()`;
                    } else {
                        display_value = not_na(column_m_value) ? `${String(additional_value)} (${String(column_m_value)})_ ${String(service_value)}` : `${String(additional_value)} ()_ ${String(service_value)}`;
                    }
                    if (!target_counts['Тёмные ОВ'].hasOwnProperty(display_value)) {
                        target_counts['Тёмные ОВ'][display_value] = 0;
                    }
                    target_counts['Тёмные ОВ'][display_value] += 1;
                }
                if ((not_na(service_value) && ['Г1', 'Г2'].some(g => String(service_value).includes(g)) && (not_na(column_m_value) || not_na(additional_value)))) {
                    let display_value;
                    if (not_na(additional_value)) {
                        const prefix = String(additional_value).startsWith('ГС') ? 'Спецпользователь' : String(additional_value);
                        display_value = `${prefix} ${String(service_value)}`;
                    } else {
                        display_value = String(service_value);
                    }
                    if (!target_counts['Спец'].hasOwnProperty(display_value)) {
                        target_counts['Спец'][display_value] = 0;
                    }
                    target_counts['Спец'][display_value] += 1;
                }
                if (primary_service) {
                    let display_value = "";
                    if (not_na(additional_value)) {
                        if (not_na(column_m_value)) {
                            display_value = `${String(additional_value)} (${String(column_m_value)})`;
                        } else {
                            display_value = `${String(additional_value)} ()`;
                        }
                    } else if (not_na(column_m_value)) {
                        display_value = `${String(column_m_value)} (${String(column_m_value)})`;
                    } else {
                        display_value = "";
                    }
                    if (display_value) {
                        if (!target_counts[primary_service].hasOwnProperty(display_value)) {
                            target_counts[primary_service][display_value] = 0;
                        }
                        target_counts[primary_service][display_value] += 1;
                    }
                }
            } else {
                // --- Обработка ОБЫЧНЫХ (не зарезервированных) ---
                if (String(service_value).includes("OC") && (not_na(column_m_value) || not_na(additional_value))) {
                    primary_service = 'ОК';
                }
                if (String(service_value).includes("OTU4")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '100 ГБит/с';
                    }
                }
                else if (String(service_value).includes("OTU2")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '10 ГБит/с';
                    }
                }
                if (String(service_value).includes("100G.")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '100 ГБит/с';
                    }
                }
                else if (String(service_value).includes("10G.")) {
                    if (!(is_na(column_m_value) && is_na(additional_value))) {
                        primary_service = '10 ГБит/с';
                    }
                }
                if (primary_service === null) {
                    if (String(service_value).includes('100GE')) primary_service = '100 ГБит/с';
                    else if (String(service_value).includes('10GE')) primary_service = '10 ГБит/с';
                    else if ((String(service_value).includes('S16.') || String(service_value).includes('c4*16.'))) {
                        primary_service = '2.5 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('VC4')) {
                        primary_service = '155 МБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('VC3')) primary_service = '45 МБит/с';
                    else if ((String(service_value).includes('VC12') || String(service_value).includes('E1'))) {
                        if (is_na(column_m_value) && is_na(additional_value)) {
                            additional_value = "ПЦТ";
                        }
                        primary_service = '2 МБит/с';
                    }
                    else if (String(service_value).includes('S64')) {
                        primary_service = '10 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                    else if (String(service_value).includes('GE') && !String(service_value).includes('100GE') && !String(service_value).includes('10GE')) {
                        primary_service = '1 ГБит/с';
                        if (is_na(column_m_value) && is_na(additional_value)) continue;
                    }
                }
                // Тёмные ОВ и Спец для обычных
                if ((not_na(service_value) && String(service_value).includes('(') && (not_na(column_m_value) || not_na(additional_value)) && !['Г1', 'Г2'].some(g => String(service_value).includes(g)))) {
                    const service_main = String(service_value).split(')')[0].trim();
                    let display_value;
                    if (is_na(additional_value)) {
                        display_value = `${service_main} ()`;
                    } else {
                        display_value = not_na(column_m_value) ? `${String(additional_value)} (${String(column_m_value)})_ ${service_main})` : `${String(additional_value)} ()_ ${service_main})`;
                    }
                    if (!target_counts['Тёмные ОВ'].hasOwnProperty(display_value)) {
                        target_counts['Тёмные ОВ'][display_value] = 0;
                    }
                    target_counts['Тёмные ОВ'][display_value] += 1;
                }
                if ((not_na(service_value) && ['Г1', 'Г2'].some(g => String(service_value).includes(g)) && (not_na(column_m_value) || not_na(additional_value)))) {
                    const service_main = String(service_value).split(')')[0].trim();
                    let display_value;
                    if (not_na(additional_value)) {
                        const prefix = String(additional_value).startsWith('ГС') ? 'Спецпользователь' : String(additional_value);
                        display_value = `${prefix} ${service_main})`;
                    } else {
                        display_value = service_main;
                    }
                    if (!target_counts['Спец'].hasOwnProperty(display_value)) {
                        target_counts['Спец'][display_value] = 0;
                    }
                    target_counts['Спец'][display_value] += 1;
                }
                if (primary_service) {
                    let display_value = "";
                    if (not_na(additional_value)) {
                        if (not_na(column_m_value)) {
                            display_value = `${String(additional_value)} (${String(column_m_value)})`;
                        } else {
                            display_value = `${String(additional_value)} ()`;
                        }
                    } else if (not_na(column_m_value)) {
                        display_value = `${String(column_m_value)} (${String(column_m_value)})`;
                    } else {
                        display_value = "";
                    }
                    if (display_value) {
                        if (!target_counts[primary_service].hasOwnProperty(display_value)) {
                            target_counts[primary_service][display_value] = 0;
                        }
                        target_counts[primary_service][display_value] += 1;
                    }
                }
            }
        }
    }
    // --- ИСПРАВЛЕНО ---
    // Объединяем данные из локальных serviceCounts и serviceCountsReserved в глобальные currentServiceCounts и currentServiceCountsReserved
    for (let serviceType in serviceCounts) {
        if (!currentServiceCounts[serviceType]) {
            currentServiceCounts[serviceType] = {}; // Инициализируем, если не существует
        }
        for (let displayValue in serviceCounts[serviceType]) {
            if (!currentServiceCounts[serviceType].hasOwnProperty(displayValue)) {
                currentServiceCounts[serviceType][displayValue] = 0;
            }
            currentServiceCounts[serviceType][displayValue] += serviceCounts[serviceType][displayValue];
        }
    }
    for (let serviceType in serviceCountsReserved) {
        if (!currentServiceCountsReserved[serviceType]) {
            currentServiceCountsReserved[serviceType] = {}; // Инициализируем, если не существует
        }
        for (let displayValue in serviceCountsReserved[serviceType]) {
            if (!currentServiceCountsReserved[serviceType].hasOwnProperty(displayValue)) {
                currentServiceCountsReserved[serviceType][displayValue] = 0;
            }
            currentServiceCountsReserved[serviceType][displayValue] += serviceCountsReserved[serviceType][displayValue];
        }
    }
}

// --- ИЗМЕНЕНО: processCBDData использует globalSeenServicesAndCodes ---
function processCBDData(data) {
    // Helper functions
    function is_na(value) {
        return value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
    }
    function not_na(value) {
        return !is_na(value);
    }

    // Инициализация структуры данных ЛОКАЛЬНО
    let serviceCounts = {
        'ОК': {}, '100 ГБит/с': {}, '10 ГБит/с': {}, '2.5 ГБит/с': {},
        '1 ГБит/с': {}, '155 МБит/с': {}, '45 МБит/с': {}, '2 МБит/с': {},
        'Спец': {}, 'Тёмные ОВ': {}
    };

    // Получаем заголовки из первой строки
    const headers = data[0];
    const codeIndex = headers.indexOf('Код');
    const tractIndex = headers.indexOf('Тракт');
    const indexIndex = headers.indexOf('Индекс');
    const speedIndex = headers.indexOf('Скорость');
    const usageIndex = headers.indexOf('Вид использования');
    const clientAIndex = headers.indexOf('Клиент А');
    const clientBIndex = headers.indexOf('Клиент Б');
    const systemIndex = headers.indexOf('Система');
    const mkIndex = headers.indexOf('МК');

    if (codeIndex === -1 || tractIndex === -1 || indexIndex === -1 || speedIndex === -1 || usageIndex === -1 ||
        clientAIndex === -1 || clientBIndex === -1 || systemIndex === -1 || mkIndex === -1) {
        console.error("Не все необходимые столбцы найдены в файле ЦБД.");
        return; // Прерываем обработку файла
    }

    // Начинаем перебор строк, начиная с индекса 1 (пропускаем заголовки)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const code_raw = row[codeIndex];
        const code = not_na(code_raw) ? String(code_raw).trim() : '';

        // Пропускаем строки без кода
        if (!code) {
            continue;
        }

        // --- ПРОВЕРКА НА ДУБЛИКАТ ---
        // Используем значение из столбца 'Код' как идентификатор для CBD
        const uniqueId = code;
        if (globalSeenServicesAndCodes[uniqueId]) {
            continue; // Пропускаем, если уже видели
        }
        globalSeenServicesAndCodes[uniqueId] = true; // Отмечаем как виденный
        // --- КОНЕЦ ПРОВЕРКИ ---

        const tract_raw = row[tractIndex];
        const index_raw = row[indexIndex];
        const speed_raw = row[speedIndex];
        const usage_raw = row[usageIndex];
        const clientA_raw = row[clientAIndex];
        const clientB_raw = row[clientBIndex];
        const system_raw = row[systemIndex];
        const mk_raw = row[mkIndex];
        const tract = not_na(tract_raw) ? String(tract_raw).trim().toUpperCase() : '';
        const index_ = not_na(index_raw) ? String(index_raw).trim() : '';
        const speed = not_na(speed_raw) ? String(speed_raw).trim().toUpperCase() : '';
        let usage = not_na(usage_raw) ? String(usage_raw).trim() : '';
        const cA = not_na(clientA_raw) ? String(clientA_raw).trim() : '';
        const cB = not_na(clientB_raw) ? String(clientB_raw).trim() : '';
        const system = not_na(system_raw) ? String(system_raw).trim() : '';
        const mk = not_na(mk_raw) ? String(mk_raw).trim().toUpperCase() : '';

        if (['6', '7', '8'].includes(index_)) {
            continue;
        }
        if (usage.toUpperCase().includes('РЕЗ')) {
            continue;
        }
        if (!usage) {
            if (tract === 'ПЦТ') {
                usage = 'ПЦТ';
            } else {
                continue;
            }
        }

        let primary = null;
        if (tract === 'ДЦТ') primary = '100 ГБит/с';
        else if (tract === 'ОК') primary = 'ОК';
        else if (tract === 'ПЦТ') primary = '2 МБит/с';
        else if (tract === 'СШТ') primary = '2.5 ГБит/с';
        else if (tract === 'ТЦТ') primary = '45 МБит/с';
        else if (tract === 'ЧЦТ' || tract === 'ЧГ') {
            primary = null;
            if (!mk) {
                if (speed.startsWith('10')) primary = '10 ГБит/с';
                else if (speed.startsWith('155')) primary = '155 МБит/с';
                else if ((speed.startsWith('1') && !speed.startsWith('10')) || speed.includes('GE')) primary = '1 ГБит/с';
            } else {
                if (mk.startsWith('155') || mk.startsWith('1890') || mk.startsWith('VC4S')) primary = '155 МБит/с';
                else if (mk.startsWith('10') || mk.startsWith('64') || mk.startsWith('120960')) primary = '10 ГБит/с';
                else if (mk.startsWith('2.5')) primary = '2.5 ГБит/с';
                else if ((speed.startsWith('1') && !speed.startsWith('10')) || speed.includes('GE')) primary = '1 ГБит/с';
            }
        }
        else if (tract === 'ЛТ' && usage.toUpperCase().startsWith('ГС')) primary = 'Спец';
        else if (tract === 'ЛТ') primary = 'Тёмные ОВ';

        if (!primary) continue;

        let client_val = cA || cB;
        let display_value = '';
        if (primary === 'Тёмные ОВ') {
            display_value = system ? `${usage} (${client_val}) ЛТ-${system}` : `${usage} (${client_val})`;
        } else if (primary === 'Спец') {
            display_value = system ? `${usage} ЛТ-${system}` : `${usage} (${client_val})`;
        } else {
            display_value = `${usage} (${client_val})`;
        }

        if (primary === 'Спец' && usage.toUpperCase().startsWith('ГС')) {
            display_value = display_value.replace('ГС', 'Спецпользователь');
        }

        if (!serviceCounts[primary].hasOwnProperty(display_value)) {
            serviceCounts[primary][display_value] = 0;
        }
        serviceCounts[primary][display_value] += 1;
    }
    // --- ИСПРАВЛЕНО ---
    // Объединяем данные из локального serviceCounts в глобальный currentServiceCounts
    for (let serviceType in serviceCounts) {
        if (!currentServiceCounts[serviceType]) {
            currentServiceCounts[serviceType] = {}; // Инициализируем, если не существует
        }
        for (let displayValue in serviceCounts[serviceType]) {
            if (!currentServiceCounts[serviceType].hasOwnProperty(displayValue)) {
                currentServiceCounts[serviceType][displayValue] = 0;
            }
            currentServiceCounts[serviceType][displayValue] += serviceCounts[serviceType][displayValue];
        }
    }
    // ЦБД не использует зарезервированные в этой логике, очищаем их
    for (let key in currentServiceCountsReserved) {
        delete currentServiceCountsReserved[key];
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
}

// --- Вспомогательные функции ---
function is_na(value) {
    // В JS считаем null, undefined и пустую строку как NA
    return value === null || value === undefined || value === "";
}

function not_na(value) {
    return !is_na(value);
}

function isinstance(value, type) {
    if (type === 'str') {
        return typeof value === 'string' || value instanceof String;
    }
    // Можно добавить другие типы при необходимости
    return false;
}




function generateTabsContent(serviceCounts, serviceCountsReserved) {
    tabsData = [];
    const order = ['ОК', '100 ГБит/с', '10 ГБит/с', '2.5 ГБит/с', '1 ГБит/с', '155 МБит/с', '45 МБит/с', '2 МБит/с', 'Спец', 'Тёмные ОВ'];
    const priority = [
        ["РосОперат", "B2O"], // Исключаем "B2Oм"
        ["РосКлиент", "B2B"],
        ["B2G"],
        ["ТЕА"],
        ["МЗАРУБКОМП", "B2Oм"], // Теперь включаем "B2Oм"
        ["ТВО"],
        ["СПД"]
    ];

    for (const service of order) {
        const categories = serviceCounts[service] || {};
        const categoriesReserved = serviceCountsReserved[service] || {};

        if (Object.keys(categories).length === 0 && Object.keys(categoriesReserved).length === 0) {
            continue;
        }

        let content = "";

        const total_count = Object.values(categories).reduce((sum, val) => sum + val, 0);
        const total_count_reserved = Object.values(categoriesReserved).reduce((sum, val) => sum + val, 0);
        const has_any_reserved_data = Object.keys(currentServiceCountsReserved).some(
            key => Object.keys(currentServiceCountsReserved[key]).length > 0
        );

        // ============= БЛОК 1: Всего / Всего сервисов =============
        if (has_any_reserved_data && (total_count + total_count_reserved > 0)) {
            content += `<h4 style="margin-bottom: 5px;">Всего сервисов: ${total_count + total_count_reserved}</h4>`;
        } else if (total_count + total_count_reserved > 0) {
            content += `<h4 style="margin-bottom: 5px;">Всего: ${total_count + total_count_reserved}</h4>`;
        }

        // ============= БЛОК 2: Пропало (только если есть резерв где-то в данных) =============
        if (has_any_reserved_data && total_count > 0) {
            content += `<h4>Пропало: ${total_count}</h4>`;

            // Сами категории "Пропало"
            const allCats = Object.entries(categories).sort((a, b) => {
                // приоритетная сортировка по группам
                const priorityIndexA = priority.findIndex(g => g.some(p => a[0].includes(p)));
                const priorityIndexB = priority.findIndex(g => g.some(p => b[0].includes(p)));
                if (priorityIndexA !== priorityIndexB) return priorityIndexA - priorityIndexB;
                return a[0].localeCompare(b[0]);
            });

            const printed = new Set();
            for (const group of priority) {
                for (const [category, count] of allCats) {
                    if (printed.has(category)) continue;
                    if (group.some(p => category.includes(p))) {
                        content += `${category}: ${count}<br>`;
                        printed.add(category);
                    }
                }
            }
            for (const [category, count] of allCats) {
                if (!printed.has(category)) {
                    content += `${category}: ${count}<br>`;
                }
            }
            content += "\n"; // отступ после списка
        }
        // Если резерва нет вообще — просто выводим обычные категории под "Всего"
        else if (!has_any_reserved_data && total_count > 0) {
            const allCats = Object.entries(categories).sort((a, b) => {
                const priorityIndexA = priority.findIndex(g => g.some(p => a[0].includes(p)));
                const priorityIndexB = priority.findIndex(g => g.some(p => b[0].includes(p)));
                if (priorityIndexA !== priorityIndexB) return priorityIndexA - priorityIndexB;
                return a[0].localeCompare(b[0]);
            });

            const printed = new Set();
            for (const group of priority) {
                for (const [category, count] of allCats) {
                    if (printed.has(category)) continue;
                    if (group.some(p => category.includes(p))) {
                        content += `${category}: ${count}<br>`;
                        printed.add(category);
                    }
                }
            }
            for (const [category, count] of allCats) {
                if (!printed.has(category)) {
                    content += `${category}: ${count}<br>`;
                }
            }
            content += "\n";
        }

        // ============= БЛОК 3: Зарезервировано =============
        if (total_count_reserved > 0) {
            content += `<h4>Зарезервировано: ${total_count_reserved}</h4>`;

            const allCatsReserved = Object.entries(categoriesReserved).sort((a, b) => {
                const priorityIndexA = priority.findIndex(g => g.some(p => a[0].includes(p)));
                const priorityIndexB = priority.findIndex(g => g.some(p => b[0].includes(p)));
                if (priorityIndexA !== priorityIndexB) return priorityIndexA - priorityIndexB;
                return a[0].localeCompare(b[0]);
            });

            const printedReserved = new Set();
            for (const group of priority) {
                for (const [category, count] of allCatsReserved) {
                    if (printedReserved.has(category)) continue;
                    if (group.some(p => category.includes(p))) {
                        content += `${category}: ${count}<br>`;
                        printedReserved.add(category);
                    }
                }
            }
            for (const [category, count] of allCatsReserved) {
                if (!printedReserved.has(category)) {
                    content += `${category}: ${count}<br>`;
                }
            }
        }

        tabsData.push({ name: service, content: content.trim() });
    }
}


function centerActiveTab() {
    const activeTab = document.querySelector('.tab-item.active');
    if (!activeTab) return;

    const container = document.querySelector('.listos');

    // Плавное центрирование (работает во всех современных браузерах)
    activeTab.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
    });
}
document.querySelector('.listos').addEventListener('wheel', function (e) {
    e.preventDefault();

    const delta = e.deltaY || e.deltaX;
    if (delta === 0) return;

    const tabItems = document.querySelectorAll('.tab-item');
    if (tabItems.length === 0) return;

    let currentIndex = Array.from(tabItems).findIndex(item => item.classList.contains('active'));
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex = currentIndex;

    if (delta > 0) {
        // Крутим вниз/вправо → следующая вкладка
        if (currentIndex < tabItems.length - 1) {
            nextIndex = currentIndex + 1;
        }
    } else {
        // Крутим вверх/влево → предыдущая вкладка
        if (currentIndex > 0) {
            nextIndex = currentIndex - 1;
        }
    }

    // Если индекс не изменился — ничего не делаем
    if (nextIndex === currentIndex) return;

    // Переключаем вкладку
    switchTab(nextIndex);

    // === ЦЕНТРИРУЕМ АКТИВНУЮ ВКЛАДКУ ПО ГОРИЗОНТАЛИ ===
    const activeTab = tabItems[nextIndex];
    const container = document.querySelector('.listos');

    // scrollIntoView с центрированием (работает идеально и плавно)
    activeTab.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
    });

    // Дополнительная страховка для старых браузеров (если scrollIntoView не поддерживает inline: 'center')
    setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();

        const offsetLeft = tabRect.left + container.scrollLeft - containerRect.left;
        const offsetRight = containerRect.right - tabRect.right;

        if (offsetLeft < 0 || offsetRight < 0) {
            const centerOffset = tabRect.width / 2;
            const containerCenter = containerRect.width / 2;
            container.scrollLeft = container.scrollLeft + (tabRect.left - containerRect.left) - (containerCenter - centerOffset);
        }
    }, 150); // небольшая задержка после smooth-анимации

}, { passive: false });


function updateTabsDisplay() {
    const tabsList = document.getElementById('tabs-list');
    const tabsContent = document.getElementById('tabs-content');
    tabsList.innerHTML = '';
    tabsContent.innerHTML = '';

    if (tabsData.length === 0) {
        tabsList.innerHTML = '<div class="tab-item">Нет данных</div>';
        tabsContent.innerHTML = '<div class="tab-content">Загрузите файлы для отображения данных.</div>';
        return;
    }

    tabsData.forEach((tab, index) => {
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        if (index === 0) tabItem.classList.add('active');
        tabItem.textContent = tab.name;
        tabItem.addEventListener('click', () => switchTab(index));
        tabsList.appendChild(tabItem);

        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        if (index !== 0) tabContent.classList.add('hidden');
        // Меняем textContent на innerHTML
        tabContent.innerHTML = tab.content;
        tabsContent.appendChild(tabContent);
    });
}

function switchTab(index) {
    const tabItems = document.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabItems.forEach((item, i) => {
        if (i === index) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    tabContents.forEach((content, i) => {
        if (i === index) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
    });
    centerActiveTab();
}

function exportData() {
    // Проверка: есть ли вообще данные для экспорта
    const hasData = Object.keys(currentServiceCounts).length > 0 ||
        Object.keys(currentServiceCountsReserved).length > 0;

    if (!hasData || (tabsData.length === 0)) {
        alert('Нет данных для экспорта.\nСначала загрузите и обработайте файлы.');
        return;
    }

    // Показываем модальное окно
    document.getElementById('export-modal').classList.remove('hidden');
}

function performExport(format) {
    let content = '';

    if (format === 'txt') {
        content = tabsData
            .map(tab => `=== ${tab.name} ===\n${tab.content.replace(/<[^>]*>/g, '')}`)
            .join('\n\n');

    } else if (format === 'json') {
        const UNIT_MAP = {
            '100 ГБит/с': 3, '10 ГБит/с': 3, '2.5 ГБит/с': 3, '1 ГБит/с': 3,
            'ОК': 4,
            '155 МБит/с': 2, '45 МБит/с': 2, '2 МБит/с': 2,
            'Спец': 14, 'Тёмные ОВ': 14
        };

        const THROUGHPUT_MAP = {
            '100 ГБит/с': 100,
            '10 ГБит/с': 10,
            '2.5 ГБит/с': 2.5,
            '1 ГБит/с': 1,
            'ОК': 'ОК',
            '155 МБит/с': 155,
            '45 МБит/с': 45,
            '2 МБит/с': 2,
            'Спец': 'ОВ',
            'Тёмные ОВ': 'ОВ'
        };

        const jsonList = [];

        // Основные сервисы
        for (const [serviceType, categories] of Object.entries(currentServiceCounts)) {
            const unit = UNIT_MAP[serviceType] || "";
            const throughput = THROUGHPUT_MAP[serviceType] || "";

            for (const [displayValue, qty] of Object.entries(categories)) {
                const isSPD = displayValue.includes('СПД');
                const resourceUsage = serviceType === 'Спец' ? "Спецпользователь" : displayValue.trim();

                jsonList.push({
                    resourceusage: resourceUsage,
                    stream: "",
                    transportChannelThroughput: throughput,
                    transportChannelThroughputUnit: unit,
                    transportReservedResources: isSPD ? qty : 0,
                    transportLostResources: isSPD ? 0 : qty,
                    totalLo: qty
                });
            }
        }

        // Зарезервированные сервисы
        for (const [serviceType, categories] of Object.entries(currentServiceCountsReserved)) {
            const unit = UNIT_MAP[serviceType] || "";
            const throughput = THROUGHPUT_MAP[serviceType] || "";

            for (const [displayValue, qty] of Object.entries(categories)) {
                const resourceUsage = serviceType === 'Спец' ? "Спецпользователь" : displayValue.trim();

                jsonList.push({
                    resourceusage: resourceUsage,
                    stream: "",
                    transportChannelThroughput: throughput,
                    transportChannelThroughputUnit: unit,
                    transportReservedResources: qty,
                    transportLostResources: 0,
                    totalLo: qty
                });
            }
        }

        content = JSON.stringify(jsonList, null, 2);
    }

    // Скачивание
    const blob = new Blob([content], {
        type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

// === ОБРАБОТКА МОДАЛЬНОГО ОКНА ЭКСПОРТА (ГАРАНТИРОВАННО РАБОТАЕТ) ===
document.getElementById('export-button').addEventListener('click', exportData);

// Открытие модального окна
function exportData() {
    const hasData = Object.keys(currentServiceCounts).length > 0 ||
        Object.keys(currentServiceCountsReserved).length > 0;

    if (!hasData || tabsData.length === 0) {
        alert('Нет данных для экспорта.\nСначала загрузите и обработайте файлы.');
        return;
    }

    document.getElementById('export-modal').classList.remove('hidden');
}

// ЗАКРЫТИЕ модалки (клик вне или "Отмена")
document.getElementById('export-modal').addEventListener('click', function (e) {
    if (e.target === this || e.target.classList.contains('export-cancel')) {
        this.classList.add('hidden');
    }
});

// ОБРАБОТКА КНОПОК JSON / TXT — используем делегирование (работает всегда!)
document.getElementById('export-modal').addEventListener('click', function (e) {
    const btn = e.target.closest('.export-btn');
    if (!btn) return;

    const format = btn.getAttribute('data-format'); // "json" или "txt"
    document.getElementById('export-modal').classList.add('hidden');
    performExport(format);
});
