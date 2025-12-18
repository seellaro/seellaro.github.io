// main.js

document.addEventListener('DOMContentLoaded', async function () {
    // === Константы и элементы DOM ===
    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    const totalDistanceElement = document.getElementById('totalDistance');

    let pointIdCounter = 0;

    // Ключи для localStorage
    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const THEME_KEY = 'theme';
    const HISTORY_KEY = 'kml_generator_history';

    // === Глобальные переменные для карты и объектов Яндекса ===
    let ymap = null;                    // Основная карта
    let schemeLayer = null;             // Слой схемы (для смены темы)
    let featuresLayer = null;           // YMapDefaultFeaturesLayer — сюда добавляем все объекты

    let connectingPolyline = null;      // Полилиния, соединяющая точки по порядку
    let kmlLinesCollection = null;      // Коллекция для синих линий из загруженного KML
    let kmlLinesVisible = true;         // Флаг видимости синих линий (для кнопки переключения)

    let wells = [];                     // Загруженные колодцы из XLSX
    let history = [];                   // История карт (загружается из localStorage)
    let digitInputBuffer = '';
    let digitInputTimeout = null;
    let lastExplicitIndex = null;

    // === Инициализация карты Yandex ===
    await ymaps3.ready;

    const {
        YMap,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapMarker,
        YMapListener,
        YMapFeature
    } = ymaps3;

    // Определяем начальную тему
    const storedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (!storedTheme && prefersDark);
    const initialTheme = isDark ? 'dark' : 'light';

    // Создаём карту
    ymap = new YMap(mapElement, {
        location: {
            center: [37.6173, 55.76],  // Москва, как было раньше
            zoom: 10
        }
    });

    // Базовый слой схемы с темой
    schemeLayer = new YMapDefaultSchemeLayer({ theme: initialTheme });
    ymap.addChild(schemeLayer);

    // Слой для всех наших объектов (точки, линии и т.д.)
    featuresLayer = new YMapDefaultFeaturesLayer();
    ymap.addChild(featuresLayer);

    // Делаем глобально доступными для theme.js и других скриптов
    window.ymap = ymap;
    window.schemeLayer = schemeLayer;
    window.mapElement = mapElement;

    // === Заглушки для будущих функций (будем заполнять поэтапно) ===

    // Создание коллекций объектов
    function createPointsCollection() {
        // Больше не нужна отдельная коллекция — маркеры добавляем прямо в карту
        // Просто очищаем старые маркеры, если они есть
        pointMarkers.forEach(marker => {
            if (marker.parent) {
                ymap.removeChild(marker);
            }
        });
        pointMarkers.clear();
    }

    // Хранилище маркеров по pointId для быстрого доступа
    const pointMarkers = new Map(); // key: pointId (string), value: YMapMarker

    // Создание HTML-элемента для маркера
    function createMarkerElement(pointName, isActive = false) {
        const isDark = document.body.classList.contains('dark-theme');

        const element = document.createElement('div');
        element.style.width = '20px';
        element.style.height = '20px';
        element.style.borderRadius = '50%';
        element.style.backgroundColor = isActive ? '#00ff00' : (isDark ? '#325572' : '#60a0d4');
        element.style.border = `2px solid ${isDark ? '#1C2526' : 'white'}`;
        element.style.boxSizing = 'border-box';
        element.style.position = 'relative';
        element.style.cursor = 'pointer';            // важно: курсор pointer
        element.style.pointerEvents = 'auto';         // разрешаем события

        // Подпись с названием
        const label = document.createElement('div');
        label.textContent = pointName || '●';
        label.style.position = 'absolute';
        label.style.left = '50%';
        label.style.top = '24px';
        label.style.transform = 'translateX(-50%)';
        label.style.whiteSpace = 'nowrap';
        label.style.font = '12px Arial';
        label.style.color = isDark ? '#D3D3D3' : 'black';
        label.style.textShadow = `1px 1px 2px ${isDark ? '#1C2526' : 'white'}`;
        label.style.pointerEvents = 'none';           // подпись не мешает кликам


        element.style.cursor = 'grab';  // вместо 'pointer'

        element.addEventListener('mousedown', () => {
            element.style.cursor = 'grabbing';
        });
        element.addEventListener('mouseup', () => {
            element.style.cursor = 'grab';
        });

        element.appendChild(label);
        return element;
    }

    // Добавление или обновление одной метки
    // Добавление или обновление одной метки
    // Добавление или обновление одной метки
    function addOrUpdateMarker(pointId, coords, name, isActive = false) {
        const coordinates = [coords.lon, coords.lat];

        let marker = pointMarkers.get(pointId);
        if (marker) {
            featuresLayer.removeChild(marker);
            pointMarkers.delete(pointId);
        }

        const element = createMarkerElement(name || '●', isActive);

        // ВАЖНО: Обработчики событий должны быть внутри первого объекта (props),
        // а не третьим аргументом.
        marker = new YMapMarker(
            {
                coordinates,
                draggable: true,
                mapFollowsOnDrag: true,
                // Переносим обработчики сюда:
                onDragStart: () => {
                    element.style.opacity = '0.7';
                    element.style.cursor = 'grabbing';
                },
                onDragEnd: (newCoordinates) => {
                    element.style.opacity = '1';
                    element.style.cursor = 'grab';

                    // YMaps3 в onDragEnd передает массив координат [lon, lat] первым аргументом
                    if (!newCoordinates || newCoordinates.length < 2) return;

                    const [newLon, newLat] = newCoordinates;

                    // 1. Обновляем координаты самого маркера (чтобы он не прыгал визуально)
                    marker.update({
                        coordinates: [newLon, newLat]
                    });

                    // 2. Находим соответствующую строку в списке
                    const row = document.querySelector(
                        `.point-row[data-point-id="${pointId}"]`
                    );

                    if (!row) return;

                    // 3. Обновляем инпут с координатами
                    const coordsInput = row.querySelector('.pointCoords');
                    if (coordsInput) {
                        coordsInput.value = `${newLat.toFixed(6)}/${newLon.toFixed(6)}`;
                    }

                    // 4. Запускаем обновление логики (дистанция, сохранение)
                    // Важно: setActiveRow вызовет updateMap, который считает новое значение из input,
                    // которое мы только что обновили выше.
                    setActiveRow(row);
                    updatePointNumbers();
                    saveDataToLocalStorage();
                }
            },
            element // Второй аргумент — HTML элемент
        );

        // Добавляем обработчик клика на сам элемент (для выделения строки)
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = document.querySelector(
                `.point-row[data-point-id="${pointId}"]`
            );
            if (row) setActiveRow(row, true);
        });

        featuresLayer.addChild(marker);
        pointMarkers.set(pointId, marker);
    }



    // Удаление метки
    function removeMarker(pointId) {
        const marker = pointMarkers.get(pointId);
        // Исправлено: удаляем из featuresLayer, а не из ymap
        if (marker && marker.parent) {
            featuresLayer.removeChild(marker);
        }
        pointMarkers.delete(pointId);
    }

    // Обновление стиля всех меток при смене темы или активности
    function updateAllMarkersStyle() {
        document.querySelectorAll('.point-row').forEach(row => {
            const pointId = row.dataset.pointId;
            const nameInput = row.querySelector('.pointName');
            const coordsInput = row.querySelector('.pointCoords');
            const isActive = row.classList.contains('active');

            if (nameInput && coordsInput && pointId) {
                const name = nameInput.value.trim();
                const coordsStr = coordsInput.value.trim();
                if (name && coordsStr) {
                    const [lat, lon] = coordsStr.split('/').map(parseFloat);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        addOrUpdateMarker(pointId, { lat, lon }, name, isActive);
                    }
                }
            }
        });
    }



    // Добавление точки на карту и в список
    function addPointToMap(pointData) {
        // Этап 2
    }

    // Обновление соединяющей полилинии и расстояния
    // Обновление соединяющей полилинии и расстояния
    function updateConnectingLineAndDistance() {
        // Удаляем старую полилинию из featuresLayer
        if (connectingPolyline) {
            featuresLayer.removeChild(connectingPolyline);
            connectingPolyline = null;
        }

        const rows = document.querySelectorAll('.point-row:not(:last-child)');
        const lineCoords = [];
        let totalMeters = 0;

        rows.forEach(row => {
            const coordsStr = row.querySelector('.pointCoords').value.trim();
            if (coordsStr) {
                const [lat, lon] = coordsStr.split('/').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                    lineCoords.push([lon, lat]);

                    if (lineCoords.length > 1) {
                        const prev = lineCoords[lineCoords.length - 2];
                        totalMeters += getDistance(prev[1], prev[0], lat, lon);
                    }
                }
            }
        });

        if (lineCoords.length < 2) {
            totalDistanceElement.textContent = 'Общее расстояние: 0 м';
            return;
        }

        // Создаём полилинию
        connectingPolyline = new ymaps3.YMapFeature({
            geometry: {
                type: 'LineString',
                coordinates: lineCoords
            },
            style: {
                stroke: [{ color: '#d05555', width: 4 }],
                zIndex: -100 // Исправлено: низкий zIndex, чтобы линия была ПОД точками
            }
        });

        // Исправлено: добавляем линию в featuresLayer, а не в корень карты
        featuresLayer.addChild(connectingPolyline);

        // Форматируем в метрах (округление до целого)
        const distanceM = Math.round(totalMeters);
        totalDistanceElement.textContent = `Общее расстояние: ${distanceM} м`;
    }

    // Перерисовка всех точек (например, при смене темы)
    function updatePointsStyle() {
        // Этап 6
    }

    // Очистка карты от всех объектов
    function clearMap() {
        // Удаляем все маркеры точек
        pointMarkers.forEach(marker => {
            if (marker && marker.parent) {
                // Если маркеры в featuresLayer, удаляем оттуда
                featuresLayer.removeChild(marker);
            }
        });
        pointMarkers.clear();

        // Исправлено: удаляем линию из featuresLayer
        if (connectingPolyline) {
            featuresLayer.removeChild(connectingPolyline);
            connectingPolyline = null;
        }

        // Линии KML (если они есть) удаляем из ymap (как было в оригинале, или featuresLayer если вы их туда перенесли)
        if (kmlLinesCollection) {
            ymap.removeChild(kmlLinesCollection);
            kmlLinesCollection = null;
        }
        kmlLinesVisible = true;
        if (totalDistanceElement) {
            totalDistanceElement.textContent = 'Общее расстояние: 0 км';
        }
    }
    // Загрузка точек в интерфейс (из localStorage, истории или KML)
    function loadPointsIntoUI(pointsArray, mapName = '') {
        // Очистка текущего списка
        pointsContainer.innerHTML = '';
        pointIdCounter = 0;

        mapNameInput.value = mapName || '';

        pointsArray.forEach(point => {
            addPointRow(point.name, `${point.lat.toFixed(6)}/${point.lon.toFixed(6)}`, point.id);
        });

        // Добавим пустую строку в конец
        ensureEmptyRowAtEnd();

        // Обновим карту
        updateMap();
    }

    // Основная функция обновления карты (вызывается при любом изменении точек)
    function updateMap() {
        // Собираем актуальные точки (кроме последней пустой)
        const rows = document.querySelectorAll('.point-row:not(:last-child)');

        // Сбор ID для удаления лишних маркеров
        const currentIds = new Set();
        rows.forEach(row => {
            if (row.dataset.pointId) currentIds.add(row.dataset.pointId);
        });

        // Удаляем лишние маркеры
        pointMarkers.forEach((_, pointId) => {
            if (!currentIds.has(pointId)) {
                removeMarker(pointId);
            }
        });

        // Создаём/обновляем маркеры (всегда пересоздаём — это гарантирует актуальный стиль и название)
        rows.forEach(row => {
            const name = row.querySelector('.pointName').value.trim();
            const coordsStr = row.querySelector('.pointCoords').value.trim();
            const isActive = row.classList.contains('active');

            if (coordsStr) {
                const pointId = row.dataset.pointId;
                if (pointId) {
                    const [lat, lon] = coordsStr.split('/').map(parseFloat);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        addOrUpdateMarker(pointId, { lat, lon }, name || '●', isActive);
                    }
                }
            }
        });
        updateConnectingLineAndDistance();
    }

    // === Функции работы со списком точек (остаются почти без изменений) ===

    function addPointRow(name = '', coords = '', makeReal = true) {
        const row = document.createElement('div');
        row.className = 'point-row';

        // Только "реальные" строки (с координатами или вручную добавленные) получают pointId
        if (makeReal) {
            const id = pointIdCounter++;
            row.dataset.pointId = id;
        }

        row.innerHTML = `
        <div class="point-number"></div>
        <div class="drag-handle">☰</div>
        <input type="text" class="pointName" placeholder="Название" value="${name}">
        <input type="text" class="pointCoords" placeholder="lat/lon" value="${coords}">
        <button class="deletePoint">✖</button>
    `;

        pointsContainer.appendChild(row);  // добавляем в конец
        updatePointNumbers();
        return row;
    }

    function ensureEmptyRowAtEnd() {
        // Удаляем все пустые строки, кроме одной в конце
        const rows = Array.from(pointsContainer.querySelectorAll('.point-row'));

        // Находим все пустые строки (нет названия и координат)
        const emptyRows = rows.filter(row => {
            const name = row.querySelector('.pointName').value.trim();
            const coords = row.querySelector('.pointCoords').value.trim();
            return name === '' && coords === '';
        });

        // Удаляем все пустые, кроме последней
        emptyRows.slice(0, -1).forEach(row => row.remove());

        // Если вообще нет строк или последняя не пустая — добавляем пустую
        const lastRow = pointsContainer.lastElementChild;
        if (!lastRow ||
            lastRow.querySelector('.pointName').value.trim() !== '' ||
            lastRow.querySelector('.pointCoords').value.trim() !== '') {
            addPointRow('', '', false); // false = фантомная, без pointId
        }
    }

    function updatePointNumbers() {
        const rows = pointsContainer.querySelectorAll('.point-row');
        let realIndex = 1;

        rows.forEach((row) => {
            const numberCell = row.querySelector('.point-number');
            const nameVal = row.querySelector('.pointName').value.trim();
            const coordsVal = row.querySelector('.pointCoords').value.trim();
            const hasData = nameVal !== '' || coordsVal !== '';

            // Если строка имеет данные и у неё есть pointId — нумеруем
            if (hasData && row.dataset.pointId) {
                numberCell.textContent = realIndex++;
            } else {
                numberCell.textContent = ''; // фантомная или пустая — без номера
            }
        });
    }

    // Расчёт расстояния между двумя точками в метрах (формула гаверсинуса)
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // радиус Земли в метрах
        const toRad = (deg) => deg * Math.PI / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // расстояние в метрах
    }









    function setActiveRow(row, scrollIntoView = false) {
        // Снимаем активность со всех строк
        document.querySelectorAll('.point-row').forEach(r => r.classList.remove('active'));

        if (row) {
            row.classList.add('active');

            // Получаем координаты из строки
            const coordsInput = row.querySelector('.pointCoords');
            if (coordsInput && coordsInput.value.trim()) {
                const [lat, lon] = coordsInput.value.trim().split('/').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                    ymap.setLocation({
                        center: [lon, lat],
                        duration: 500
                    });
                }
            }

            if (scrollIntoView) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // Обновляем стиль меток (чтобы активная стала зелёной)
            updateMap();
        }
    }

    // === Сохранение и загрузка данных ===

    function saveDataToLocalStorage() {
        const points = [];
        document.querySelectorAll('.point-row:not(:last-child)').forEach(row => {
            const name = row.querySelector('.pointName').value.trim();
            const coords = row.querySelector('.pointCoords').value.trim();
            if (name && coords) {
                const [lat, lon] = coords.split('/').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                    points.push({ id: row.dataset.pointId, name, lat, lon });
                }
            }
        });

        localStorage.setItem(POINTS_KEY, JSON.stringify(points));
        localStorage.setItem(MAP_NAME_KEY, mapNameInput.value);
    }

    function loadDataFromLocalStorage() {
        const savedPoints = JSON.parse(localStorage.getItem(POINTS_KEY) || '[]');
        const savedName = localStorage.getItem(MAP_NAME_KEY) || '';
        if (savedPoints.length > 0) {
            loadPointsIntoUI(savedPoints, savedName);
        }
    }

    // === Инициализация при старте ===
    createPointsCollection();  // Пока пустая, но вызовем для порядка
    loadDataFromLocalStorage();
    ensureEmptyRowAtEnd();
    updateMap();

    // === Обработчики кнопок (пока только основные) ===
    document.getElementById('addPointButton').addEventListener('click', () => {
        const row = addPointRow();
        setActiveRow(row, true);
    });

    document.getElementById('clearButton').addEventListener('click', () => {
        if (confirm('Очистить все точки?')) {
            pointsContainer.innerHTML = '';
            addPointRow(); // пустая строка
            clearMap();
            updateMap();
            totalDistanceElement.textContent = 'Общее расстояние: 0 км';
            saveDataToLocalStorage();
        }
    });

    // Обновление карты при изменении полей в строках
    // === ЕДИНЫЙ обработчик ввода (input) ===
    pointsContainer.addEventListener('input', (e) => {
        const target = e.target;
        if (!target.classList.contains('pointName') && !target.classList.contains('pointCoords')) return;

        const row = target.closest('.point-row');
        if (!row) return;

        let needUpdate = false;

        // Если это фантомная строка (без pointId) и в неё начали вводить — делаем реальной
        if (!row.dataset.pointId) {
            const nameVal = row.querySelector('.pointName').value.trim();
            const coordsVal = row.querySelector('.pointCoords').value.trim();

            if (nameVal !== '' || coordsVal !== '') {
                const newId = pointIdCounter++;
                row.dataset.pointId = newId;
                needUpdate = true;

                // Добавляем новую пустую строку в конец
                ensureEmptyRowAtEnd();
            }
        }

        // Всегда обновляем карту и сохраняем при любом вводе
        if (needUpdate) {
            updatePointNumbers();
        }
        updateMap();
        saveDataToLocalStorage();
    });

    // === ЕДИНЫЙ обработчик кликов по контейнеру ===
    pointsContainer.addEventListener('click', (e) => {
        // Удаление точки
        if (e.target.classList.contains('deletePoint')) {
            const row = e.target.closest('.point-row');
            if (row && row.dataset.pointId) {
                removeMarker(row.dataset.pointId);
                row.remove();

                updatePointNumbers();
                updateMap(); // обновит маркеры
                updateConnectingLineAndDistance(); // обновит линию и расстояние
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
            }
            return;
        }

        // Выделение строки (любая строка, включая фантомную)
        const row = e.target.closest('.point-row');
        if (row) {
            setActiveRow(row, true);
            updateMap(); // обновит цвет активной метки (если есть)
        }
    });


    // Слушатель кликов по базовому слою (чтобы ловить клики по пустой карте, но не по маркерам)
    const clickListener = new YMapListener({
        layer: 'any',
        onClick: (object, event) => {
            if (object) return;
            if (!event?.coordinates) return;

            const [lon, lat] = event.coordinates;

            const activeRow = document.querySelector('.point-row.active');
            if (!activeRow) return;

            const coordsInput = activeRow.querySelector('.pointCoords');
            if (!coordsInput) return;

            if (coordsInput.value.trim() !== '') {
                return;
            }

            // 1. Записываем координаты
            coordsInput.value = `${lat.toFixed(6)}/${lon.toFixed(6)}`;

            // 2. Если это была фантомная строка (нет ID), даем ей ID
            if (!activeRow.dataset.pointId) {
                const newId = pointIdCounter++;
                activeRow.dataset.pointId = newId;
            }

            // 3. Сохраняем и обновляем номера
            saveDataToLocalStorage();
            updatePointNumbers();

            // 4. ВАЖНО: Сначала добавляем новую пустую строку в конец списка!
            // Теперь activeRow перестанет быть :last-child
            ensureEmptyRowAtEnd();

            // 5. И только теперь обновляем карту. updateMap берет все строки :not(:last-child).
            // Так как мы добавили новую пустую строку шагом выше, наша заполненная строка попадет в выборку.
            updateMap();
        }
    });
    ymap.addChild(clickListener);

    // === Модальное окно выбора загрузки KML ===
const lineChoiceModal = document.getElementById('lineChoiceModal');
const lineChoiceBackdrop = document.getElementById('lineChoiceModalBackdrop');
const loadWithLinesBtn = document.getElementById('loadWithLinesBtn');
const loadWithoutLinesBtn = document.getElementById('loadWithoutLinesBtn');
const lineChoiceClose = document.getElementById('lineChoiceClose');

function showLineChoiceModal() {
    lineChoiceModal.style.display = 'block';
    lineChoiceBackdrop.style.display = 'block';
    setTimeout(() => {
        lineChoiceModal.classList.add('show');
        lineChoiceBackdrop.classList.add('show');
    }, 10);
}

function hideLineChoiceModal() {
    lineChoiceModal.classList.remove('show');
    lineChoiceBackdrop.classList.remove('show');
    setTimeout(() => {
        lineChoiceModal.style.display = 'none';
        lineChoiceBackdrop.style.display = 'none';
    }, 300);
}

loadWithLinesBtn.onclick = () => {
    window.kmlGenerator.loadPointsIntoUI(opener.points, opener.mapName);
    opener.loadKmlLinesIntoMap(opener.lineCoordsList);
    opener.showStartPointModal(opener.points, opener.mapName);
    hideLineChoiceModal();
};

loadWithoutLinesBtn.onclick = () => {
    window.kmlGenerator.loadPointsIntoUI(opener.points, opener.mapName);
    hideLineChoiceModal();
};

lineChoiceClose.onclick = hideLineChoiceModal;
lineChoiceBackdrop.onclick = (e) => {
    if (e.target === lineChoiceBackdrop) hideLineChoiceModal();
};

// === Drop-зона для KML ===
const dropZone = document.getElementById('drop_zone');

// Визуальная подсказка при перетаскивании
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = 'rgba(0, 211, 248, 0.2)';
    dropZone.style.border = '2px dashed #00d3f8';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = '';
    dropZone.style.border = '';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = '';
    dropZone.style.border = '';

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.kml')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const kmlText = ev.target.result;
            const parsed = opener.parseKML(kmlText);

            if (parsed.points.length === 0 && parsed.lineCoordsList.length === 0) {
                alert('В KML не найдено точек или линий');
                return;
            }

            opener.points = parsed.points;
            opener.lineCoordsList = parsed.lineCoordsList;
            opener.mapName = parsed.mapName;

            showLineChoiceModal();
        };
        reader.readAsText(file);
    } else {
        alert('Пожалуйста, перетащите файл с расширением .kml');
    }
});

// === Приём данных из Argus ===
window.addEventListener('message', e => {
    if (e.origin !== 'https://seellaro.github.io') return;
    if (e.data?.type !== 'ARGUS_WELL') return;

    const { name, lat, lon } = e.data.well;
    if (!name || !lat || !lon) return;

    const row = addPointRow(name, `${lat.toFixed(6)}/${lon.toFixed(6)}`);
    updateMap();
    saveDataToLocalStorage();
    ensureEmptyRowAtEnd();
    updatePointNumbers();
    setActiveRow(row, true);
});




    // === Экспорт глобального объекта для других скриптов ===
    window.kmlGenerator = {
        ymap,
        schemeLayer,
        featuresLayer,
        updateMap,
        loadPointsIntoUI,
        clearMap,
        updatePointsStyle: updateAllMarkersStyle,  // для смены темы позже
        updateConnectingLineAndDistance,
        updateAllMarkersStyle
    };
});