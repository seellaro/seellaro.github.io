// Глобальные переменные для хранения данных
let currentServiceCounts = {};
let currentServiceCountsReserved = {};
let tabsData = []; // [{name: '...', content: '...'}, ...]

// Глобальная переменная для отслеживания уникальных записей между файлами в одной операции
let globalSeenServicesAndCodes = {};





document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    setupEventListeners();
    updateStyles();
});

function initializeApp() {
    // Инициализация данных
    currentServiceCounts = {};
    currentServiceCountsReserved = {};
    tabsData.length = 0;
    // Инициализация глобального объекта для отслеживания
    globalSeenServicesAndCodes = {};
    updateTabsDisplay();
}

function setupEventListeners() {
    document.getElementById('lp-button').addEventListener('click', () => openFile('lp'));
    document.getElementById('lt-button').addEventListener('click', () => openFile('lt'));
    document.getElementById('cbd-button').addEventListener('click', () => openFile('cbd'));
    document.getElementById('export-button').addEventListener('click', exportData);
}







function openFile(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.xml';
    input.multiple = true;
    input.onchange = e => {
        const files = e.target.files;
        if (files.length === 0) return;

        // Сброс ВСЕХ данных и глобального объекта перед обработкой новых файлов
        currentServiceCounts = {};
        currentServiceCountsReserved = {};
        tabsData = [];
        globalSeenServicesAndCodes = {}; // Сброс для новой операции

        const promises = Array.from(files).map(file => processFile(file, type));
        Promise.all(promises).then(() => {
            generateTabsContent(currentServiceCounts, currentServiceCountsReserved);
            updateTabsDisplay();
        }).catch(error => {
            console.error('Ошибка при обработке файлов:', error);
            alert(`Ошибка при обработке файлов: ${error.message || error}`);
        });
    };
    input.click();
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
        const service_value = row[0]; // A
        const additional_value = row[13]; // N
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
        if (isinstance(status_value, 'str') && status_value.trim() === "Действующее" && isinstance(service_value, 'str') && !String(additional_value).includes('РЕЗ')) {
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
                        // additional_value = "ПЦТ"; // Не нужно менять переменную, просто используем строку
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
                    display_value = `${prefix} ${service_main}`;
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
        const service_value = row[0];
        const additional_value = row[10];
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
            if (not_na(service_value) && String(service_value).includes("OC.") && String(reserve_status_raw) === "Есть резерв" && not_na(next_row[0]) && !String(next_row[0]).includes("OC.")) {
                reserved = "Есть резерв";
            } else if (not_na(next_row[0]) && String(next_row[0]).includes("OC.")) {
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
        if (isinstance(status_value, 'str') && status_value.trim() === "Д" && isinstance(service_value, 'str') && !String(additional_value).includes('РЕЗ')) {
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
                            // additional_value = "ПЦТ"; // Не меняем переменную, просто используем строку
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
                            // additional_value = "ПЦТ"; // Не меняем переменную, просто используем строку
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
                        display_value = `${prefix} ${service_main}`;
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

    if (codeIndex === -1) {
        console.error("Столбец 'Код' не найден в файле ЦБД.");
        return; // Прерываем обработку файла
    }

    // Начинаем перебор строк, начиная с индекса 1 (пропускаем заголовки)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const code_raw = row[codeIndex];
        const code = String(code_raw).trim(); // Преобразуем в строку и убираем пробелы

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
        const clientA = row[clientAIndex];
        const clientB = row[clientBIndex];
        const system_raw = row[systemIndex];
        const mk_raw = row[mkIndex];
        const tract = String(tract_raw).trim().toUpperCase();
        const index_ = String(index_raw).trim();
        const speed = String(speed_raw).trim().toUpperCase();
        let usage = String(usage_raw).trim();
        const cA = String(clientA).trim();
        const cB = String(clientB).trim();
        const system = String(system_raw).trim();
        const mk = String(mk_raw).trim().toUpperCase();

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
            const mkUpper = mk.toUpperCase();
            const speedUpper = speed.toUpperCase();
            if (!mk) {
                if (speedUpper.startsWith('10')) primary = '10 ГБит/с';
                else if (speedUpper.startsWith('155')) primary = '155 МБит/с';
                else if ((speedUpper.startsWith('1') && !speedUpper.startsWith('10')) || speedUpper.includes('GE')) primary = '1 ГБит/с';
            } else {
                if (mkUpper.startsWith('155') || mkUpper.startsWith('1890') || mkUpper.startsWith('VC4S')) primary = '155 МБит/с';
                else if (mkUpper.startsWith('10') || mkUpper.startsWith('64') || mkUpper.startsWith('120960')) primary = '10 ГБит/с';
                else if (mkUpper.startsWith('2.5')) primary = '2.5 ГБит/с';
                else if ((speedUpper.startsWith('1') && !speedUpper.startsWith('10')) || speedUpper.includes('GE')) primary = '1 ГБит/с';
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
            display_value = display_value.replace('ГС', 'Спецпользователь', 1);
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

        let content = ""; // Теперь content будет HTML строкой
        const total_count = Object.values(categories).reduce((sum, val) => sum + val, 0);
        const total_count_reserved = Object.values(categoriesReserved).reduce((sum, val) => sum + val, 0);
        const has_any_reserved_data = Object.keys(currentServiceCountsReserved).some(
            key => Object.keys(currentServiceCountsReserved[key]).length > 0
        );

        if (has_any_reserved_data && (total_count > 0 || total_count_reserved > 0)) {
             const total_all = total_count + total_count_reserved;
             content += `<h4>Всего сервисов: ${total_all}</h4>`;
             content += `<h4>Пропало: ${total_count}</h4>`;
             if (total_count > 0) {
                 const allCats = Object.entries(categories);
                 const printed = new Set();
                 for (const group of priority) {
                     for (const [category, count] of allCats) {
                         if (printed.has(category)) continue;
                         if (group.some(p => category.includes(p))) {
                             content += `${category}: ${count}\n`;
                             printed.add(category);
                         }
                     }
                 }
                 for (const [category, count] of allCats) {
                     if (printed.has(category)) continue;
                     content += `${category}: ${count}\n`;
                 }
             }
             content += `<h4>Зарезервировано: ${total_count_reserved}</h4>`;
             if (total_count_reserved > 0) {
                 const allCatsReserved = Object.entries(categoriesReserved);
                 const printedReserved = new Set();
                 for (const group of priority) {
                     for (const [category, count] of allCatsReserved) {
                         if (printedReserved.has(category)) continue;
                         if (group.some(p => category.includes(p))) {
                             content += `${category}: ${count}\n`;
                             printedReserved.add(category);
                         }
                     }
                 }
                 for (const [category, count] of allCatsReserved) {
                     if (printedReserved.has(category)) continue;
                     content += `${category}: ${count}\n`;
                 }
             }
        } else {
             if (total_count_reserved === 0) {
                 content += `<h4>Всего: ${total_count}</h4>`;
                 if (total_count > 0) {
                     const allCats = Object.entries(categories);
                     const printed = new Set();
                     for (const group of priority) {
                         for (const [category, count] of allCats) {
                             if (printed.has(category)) continue;
                             if (group.some(p => category.includes(p))) {
                                 content += `${category}: ${count}\n`;
                                 printed.add(category);
                             }
                         }
                     }
                     for (const [category, count] of allCats) {
                         if (printed.has(category)) continue;
                         content += `${category}: ${count}\n`;
                     }
                 }
             } else {
                 const total_all = total_count + total_count_reserved;
                 content += `<h4>Всего сервисов: ${total_all}</h4>`;
                 content += `<h4>Пропало: ${total_count}</h4>`;
                 if (total_count > 0) {
                     const allCats = Object.entries(categories);
                     const printed = new Set();
                     for (const group of priority) {
                         for (const [category, count] of allCats) {
                             if (printed.has(category)) continue;
                             if (group.some(p => category.includes(p))) {
                                 content += `${category}: ${count}\n`;
                                 printed.add(category);
                             }
                         }
                     }
                     for (const [category, count] of allCats) {
                         if (printed.has(category)) continue;
                         content += `${category}: ${count}\n`;
                     }
                 }
             }
             if (total_count_reserved > 0) {
                  content += `<h4>Зарезервировано: ${total_count_reserved}</h4>`;
                  const allCatsReserved = Object.entries(categoriesReserved);
                  const printedReserved = new Set();
                  for (const group of priority) {
                      for (const [category, count] of allCatsReserved) {
                          if (printedReserved.has(category)) continue;
                          if (group.some(p => category.includes(p))) {
                              content += `${category}: ${count}\n`;
                              printedReserved.add(category);
                          }
                      }
                  }
                  for (const [category, count] of allCatsReserved) {
                      if (printedReserved.has(category)) continue;
                      content += `${category}: ${count}\n`;
                  }
             }
        }
        // Убираем лишние символы новой строки в начале и конце, если они есть
        tabsData.push({ name: service, content: content.trim() });
    }
}

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
}

function exportData() {
    if (Object.keys(currentServiceCounts).length === 0 && Object.keys(currentServiceCountsReserved).length === 0) {
        alert('Нет данных для экспорта. Сначала выполните расчёт.');
        return;
    }
    const format = prompt('Выберите формат экспорта (json или txt):', 'json');
    if (!format || (format.toLowerCase() !== 'json' && format.toLowerCase() !== 'txt')) {
        alert('Неподдерживаемый формат. Выберите json или txt.');
        return;
    }
    let content = '';
    if (format.toLowerCase() === 'txt') {
        content = tabsData.map(tab => `=== ${tab.name} ===\n${tab.content}`).join('');
    } else if (format.toLowerCase() === 'json') {
        const UNIT_MAP = {
            '100 ГБит/с': 3, '10 ГБит/с': 3, '2.5 ГБит/с': 3, '1 ГБит/с': 3,
            'ОК': 4,
            '155 МБит/с': 2, '45 МБит/с': 2, '2 МБит/с': 2,
            'Спец': 14, 'Тёмные ОВ': 14
        };
        const THROUGHPUT_MAP = {
            '100 ГБит/с': 100,
            '10 ГБит/с': 10, '2.5 ГБит/с': 2.5,
            '1 ГБит/с': 1,
            'ОК': 'ОК',
            '155 МБит/с': 155,
            '45 МБит/с': 45,
            '2 МБит/с': 2,
            'Спец': 'ОВ', 'Тёмные ОВ': 'ОВ'
        };

        const jsonList = [];
        // Обработка основных данных
        for (const [tab_name, categories] of Object.entries(currentServiceCounts)) {
            const unit_val = UNIT_MAP[tab_name] || "";
            const throughput_val = THROUGHPUT_MAP[tab_name] || "";
            if (tab_name === '2 МБит/с' && Object.values(categories).reduce((sum, val) => sum + val, 0) > 0) {
                const total_qty = Object.values(categories).reduce((sum, val) => sum + val, 0);
                jsonList.push({
                    "resourceusage": "ПЦТ",
                    "stream": "",
                    "transportChannelThroughput": throughput_val,
                    "transportChannelThroughputUnit": unit_val,
                    "transportReservedResources": 0,
                    "transportLostResources": total_qty,
                    "totalLo": total_qty
                });
                continue;
            }
            for (const [display_value, qty] of Object.entries(categories)) {
                const is_spt = display_value.includes('СПД');
                const reserved = is_spt ? qty : 0;
                const lost = is_spt ? 0 : qty;
                const resource_val = tab_name === 'Спец' ? "Спецпользователь" : display_value;
                jsonList.push({
                    "resourceusage": resource_val,
                    "stream": "",
                    "transportChannelThroughput": throughput_val,
                    "transportChannelThroughputUnit": unit_val,
                    "transportReservedResources": reserved,
                    "transportLostResources": lost,
                    "totalLo": reserved + lost
                });
            }
        }
        // Обработка резервных данных
        for (const [tab_name, categories] of Object.entries(currentServiceCountsReserved)) {
            const unit_val = UNIT_MAP[tab_name] || "";
            const throughput_val = THROUGHPUT_MAP[tab_name] || "";
            if (tab_name === '2 МБит/с' && Object.values(categories).reduce((sum, val) => sum + val, 0) > 0) {
                const total_qty = Object.values(categories).reduce((sum, val) => sum + val, 0);
                jsonList.push({
                    "resourceusage": "ПЦТ",
                    "stream": "",
                    "transportChannelThroughput": throughput_val,
                    "transportChannelThroughputUnit": unit_val,
                    "transportReservedResources": total_qty,
                    "transportLostResources": 0,
                    "totalLo": total_qty
                });
                continue;
            }
            for (const [display_value, qty] of Object.entries(categories)) {
                const resource_val = tab_name === 'Спец' ? "Спецпользователь" : display_value;
                jsonList.push({
                    "resourceusage": resource_val,
                    "stream": "",
                    "transportChannelThroughput": throughput_val,
                    "transportChannelThroughputUnit": unit_val,
                    "transportReservedResources": qty,
                    "transportLostResources": 0,
                    "totalLo": qty
                });
            }
        }
        content = JSON.stringify(jsonList, null, 2);
    }
    const blob = new Blob([content], { type: format.toLowerCase() === 'json' ? 'application/json' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export.${format.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}