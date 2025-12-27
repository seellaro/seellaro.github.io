
document.addEventListener('DOMContentLoaded', function () {
    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    let pointIdCounter = 0;

    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const THEME_KEY = 'theme';
    const HISTORY_KEY = 'kml_generator_history';

    let vectorSource = new ol.source.Vector({ features: [] });
    let lineSource = new ol.source.Vector({ features: [] });
    let buildingSource = new ol.source.Vector({ features: [] });
    let wells = loadWellsFromSessionStorage();
    let history = [];
    let currentHistoryMode = localStorage.getItem('history_mode') || 'lich';
    window.kmlLineSource = new ol.source.Vector({ features: [] });
    let kmlWithLinesMode = false; // флаг: загружен ли KML с линиями
    let digitInputBuffer = '';
    let digitInputTimeout = null;
    let lastExplicitIndex = null

    const kmlLineLayer = new ol.layer.Vector({
        source: kmlLineSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(0, 211, 248, 0.36)', // Синий цвет
                width: 4
            })
        }),
        zIndex: 1
    });
    window.kmlLineLayer = kmlLineLayer;

    function getLineStyle() {
        const isDark = document.body.classList.contains('dark-theme');
        // Прозрачная линия маршрута по точкам
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: isDark ? 'rgba(81, 31, 31, 1)' : 'rgba(208, 85, 85, 1)',
                width: 4
            })
        });
    }

    function getPointStyle(feature) {
        const isDark = document.body.classList.contains('dark-theme');
        const isActive = feature.get('active');
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: isActive ? 'green' : (isDark ? '#325572ff' : '#60a0d4ff') }),
                stroke: new ol.style.Stroke({ color: isDark ? '#1C2526' : 'white', width: 2 })
            }),
            text: new ol.style.Text({
                text: feature.get('name'),
                font: '12px Arial',
                fill: new ol.style.Fill({ color: isDark ? '#D3D3D3' : 'black' }),
                stroke: new ol.style.Stroke({ color: isDark ? '#1C2526' : 'white', width: 1 })
            })
        });
    }

    function getBuildingStyle(feature) {
        const isDark = document.body.classList.contains('dark-theme');
        return new ol.style.Style({
            text: new ol.style.Text({
                text: feature.get('buildingNumber'),
                font: '12px Arial',
                fill: new ol.style.Fill({ color: isDark ? '#828282ff' : '#595959ff' }),
                stroke: new ol.style.Stroke({ color: isDark ? '#000' : '#fff', width: 1 }),
                offsetY: -10
            })
        });
    }

    const pointLayer = new ol.layer.Vector({
        source: vectorSource,
        style: getPointStyle,
        zIndex: 2
    });

    const lineLayer = new ol.layer.Vector({
        source: lineSource,
        style: getLineStyle,
        zIndex: 1
    });


    const buildingLayer = new ol.layer.Vector({
        source: buildingSource,
        style: getBuildingStyle,
        zIndex: 0,
        minZoom: 16
    });

    const initialZoom = 10;
    const initialView = new ol.View({
        center: ol.proj.fromLonLat([37.6173, 55.58]),
        zoom: initialZoom
    });

    const storedTheme = localStorage.getItem(THEME_KEY);
    const isDark = storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const baseLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: isDark ? 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' : 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            attributions: '© CartoDB'
        })
    });

    const map = new ol.Map({
        target: 'map',
        layers: [baseLayer, buildingLayer, pointLayer, lineLayer, kmlLineLayer],
        view: initialView
    });
    map.getInteractions().forEach(interaction => {
        if (interaction instanceof ol.interaction.DoubleClickZoom) {
            map.removeInteraction(interaction);
        }
    });


    const toggleKmlLinesControl = new ol.control.Control({
        element: (() => {
            const button = document.createElement('button');
            button.innerHTML = '🗺️';
            button.title = 'Переключить синие линии KML';
            button.style.backgroundColor = 'transparent';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.padding = '4px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '16px';
            button.style.width = '24px';
            button.style.height = '24px';
            button.addEventListener('click', () => {
                const visible = kmlLineLayer.getVisible();
                kmlLineLayer.setVisible(!visible);
                button.style.backgroundColor = visible ? 'transparent' : '#00d3f8';
            });
            const element = document.createElement('div');
            element.className = 'ol-unselectable ol-control';
            element.style.position = 'absolute';
            element.style.top = '10px';
            element.style.right = '10px';
            element.appendChild(button);
            return element;
        })()
    });
    map.addControl(toggleKmlLinesControl);

    function loadBuildings(extent) {
        buildingSource.clear();
        const [minLon, minLat, maxLon, maxLat] = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
        const overpassQuery = `
            [out:json];
            (
                way["building"]["addr:housenumber"](bbox:${minLat},${minLon},${maxLat},${maxLon});
                relation["building"]["addr:housenumber"](bbox:${minLat},${minLon},${maxLat},${maxLon});
            );
            out center;
        `;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const features = [];
                data.elements.forEach(element => {
                    if (element.tags && element.tags['addr:housenumber']) {
                        const coords = ol.proj.fromLonLat([element.center.lon, element.center.lat]);
                        const feature = new ol.Feature({
                            geometry: new ol.geom.Point(coords),
                            buildingNumber: element.tags['addr:housenumber']
                        });
                        features.push(feature);
                    }
                });
                buildingSource.addFeatures(features);
            })
            .catch(error => console.error('Ошибка загрузки данных о зданиях:', error));
    }

    map.on('moveend', function () {
        const zoom = map.getView().getZoom();
        if (zoom >= 16) {
            const extent = map.getView().calculateExtent(map.getSize());
            loadBuildings(extent);
        } else {
            buildingSource.clear();
        }
    });

    const translate = new ol.interaction.Translate({
        layers: [pointLayer]
    });


    map.addInteraction(translate);

    translate.on('translatestart', function () {
        pushState();
    });

    translate.on('translateend', function (evt) {
        const feature = evt.features.item(0);
        if (feature) {
            const coord = ol.proj.toLonLat(feature.getGeometry().getCoordinates());
            const pointId = feature.get('pointId');
            const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
            if (row) {
                const coordsInput = row.querySelector('.pointCoords');
                coordsInput.value = `${coord[1].toFixed(6)}/${coord[0].toFixed(6)}`;
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                updatePointNumbers();
                setActiveRow(row, false);
            }
        }
    });

    map.on('pointermove', function (evt) {
        const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });
        map.getTargetElement().style.cursor = feature && feature.getGeometry().getType() === 'Point' ? 'pointer' : 'default';
    });

    map.on('click', function (evt) {
        const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });
        if (feature && feature.getGeometry().getType() === 'Point') {
            const pointId = feature.get('pointId');
            const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
            if (row) {
                vectorSource.getFeatures().forEach(f => f.set('active', false));
                feature.set('active', true);
                pointLayer.getSource().changed();
                setActiveRow(row, false);
            }
        } else {
            const activeRow = document.querySelector('.point-row.active');
            if (activeRow) {
                const coordsInput = activeRow.querySelector('.pointCoords');
                const currentCoords = coordsInput.value;
                if (!currentCoords || !currentCoords.includes('/')) {
                    const coordinate = ol.proj.toLonLat(evt.coordinate);
                    coordsInput.value = `${coordinate[1].toFixed(6)}/${coordinate[0].toFixed(6)}`;
                    pushState();
                    updateMap();
                    saveDataToLocalStorage();
                    ensureEmptyRowAtEnd();
                    updatePointNumbers();
                }
            } else {

            }
        }
    });

    map.on('dblclick', function (evt) {
        const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });

        if (feature && feature.getGeometry().getType() === 'Point') {
            // Удаляем точку — НЕ приближаем
            const pointId = feature.get('pointId');
            const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
            if (row) {
                pushState();
                row.remove();
                vectorSource.removeFeature(feature);
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                updatePointNumbers();
            }
        } else {

            const view = map.getView();
            const zoom = view.getZoom();
            view.animate({
                zoom: zoom + 1,
                center: evt.coordinate,
                duration: 250
            });
        }
    });

    function setActiveRow(row, centerMap = true) {
        document.querySelectorAll('.point-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');

        const container = pointsContainer;
        const rowRect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        let offsetTop = row.offsetTop;
        const placeholders = container.querySelectorAll('.point-row-placeholder');
        placeholders.forEach(placeholder => {
            if (placeholder.offsetTop < row.offsetTop) {
                offsetTop -= placeholder.offsetHeight;
            }
        });

        const scrollPosition = offsetTop - (containerRect.height / 2 - rowRect.height / 2);
        container.scrollTo({
            top: scrollPosition,
            behavior: 'smooth'
        });

        vectorSource.getFeatures().forEach(f => f.set('active', f.get('pointId') === row.dataset.pointId));
        pointLayer.getSource().changed();

        if (centerMap) {
            const coords = row.querySelector('.pointCoords').value;
            if (coords && coords.includes('/')) {
                const [latitude, longitude] = coords.split('/').map(parseFloat);
                if (!isNaN(latitude) && !isNaN(longitude)) {
                    const coord = ol.proj.fromLonLat([longitude, latitude]);
                    map.getView().animate({
                        center: coord,
                        duration: 500,
                        easing: ol.easing.easeOut
                    });
                }
            }
        }
    }

    pointsContainer.addEventListener('click', function (event) {
        const row = event.target.closest('.point-row');
        if (row && !event.target.matches('.removePointButton') && !event.target.closest('.suggestions') && !event.target.closest('.drag-handle')) {
            setActiveRow(row, true);
        }
    });

    let debounceTimer;
    function debounce(func, delay) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(func, delay);
    }

    function addPointRow(name = '', coords = '', providedPointId = null) {
        const pointId = providedPointId !== null ? providedPointId : pointIdCounter++;
        const newPointRow = document.createElement('div');
        newPointRow.classList.add('point-row');
        newPointRow.dataset.pointId = pointId;
        newPointRow.draggable = false;          // отключаем системный DnD

        newPointRow.innerHTML = `
            <span class="drag-handle">☰</span>
            <span class="point-number"></span>
            <input type="text" class="pointName" placeholder="Название точки">
            <input type="text" class="pointCoords" placeholder="55.7558/37.6173">
            <button class="removePointButton">✖</button>
        `;

        const nameInput = newPointRow.querySelector('.pointName');
        const coordsInput = newPointRow.querySelector('.pointCoords');

        nameInput.value = name;
        coordsInput.value = coords;

        const isFilled = name.trim() !== '' || coords.trim() !== '';
        if (isFilled) removeTrailingEmptyRows();

        pointsContainer.appendChild(newPointRow);
        updatePointNumbers();

        /* новое перетаскивание мышью */
        const handle = newPointRow.querySelector('.drag-handle');
        enableManualDrag(handle, newPointRow);

        newPointRow.querySelector('.removePointButton').addEventListener('click', function () {
            const rows = document.querySelectorAll('.point-row');
            const currentName = nameInput.value.trim();
            const currentCoords = coordsInput.value.trim();
            if (rows.length === 1 && currentName === '' && currentCoords === '') return;

            pushState();
            newPointRow.remove();
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
            if (document.getElementById('quickAddModal').classList.contains('show')) {
                updateQuickAddWellList();
            }
        });

        nameInput.addEventListener('input', function (e) {
            debounce(() => {
                handleNameInput(e);
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                updatePointNumbers();
            }, 300);
        });
        nameInput.addEventListener('keydown', handleKeydown);
        nameInput.addEventListener('blur', hideSuggestions);

        coordsInput.addEventListener('input', function () {
            debounce(() => {
                pushState();
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                updatePointNumbers();
            }, 500);
        });

        return newPointRow;
    }

    let draggedRow = null;   // DOM-элемент строки
    let placeholder = null;   // пустой блок-заглушка
    let startY = 0;      // курсор в момент нажатия
    let startTop = 0;      // offsetTop строки в контейнере
    let scrollTop0 = 0;      // scroll контейнера в момент нажатия
    let mouseY = 0;

    /* старые обработчики больше не нужны – удаляем или комментируем
       handleDragStart / handleDragOver / handleDragEnd / handleDragEnter / handleDragLeave
    */

    /* NEW: «собственное» перетаскивание мышью */
    function enableManualDrag(handleElement, rowElement) {
        handleElement.style.cursor = 'grab';
        handleElement.addEventListener('mousedown', e => onMouseDown(e, rowElement));
    }

    function onMouseDown(e, row) {
        e.preventDefault();          // блокируем выделение текста
        draggedRow = row;
        mouseY = e.clientY;

        const cont = pointsContainer;
        const rect = draggedRow.getBoundingClientRect();
        const contRect = cont.getBoundingClientRect();

        startY = e.clientY;
        startTop = rect.top - contRect.top + cont.scrollTop;
        scrollTop0 = cont.scrollTop;

        placeholder = document.createElement('div');
        placeholder.className = 'point-row-placeholder';
        placeholder.style.height = rect.height + 'px';
        draggedRow.parentNode.insertBefore(placeholder, draggedRow.nextSibling);

        draggedRow.classList.add('dragging');
        draggedRow.style.position = 'absolute';
        draggedRow.style.width = rect.width + 'px';
        draggedRow.style.top = startTop + 'px';
        draggedRow.style.zIndex = 1000;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        cont.addEventListener('scroll', onContainerScroll);
    }

    function onMouseMove(e) {
        if (!draggedRow) return;

        mouseY = e.clientY; // обновляем глобальную позицию

        const cont = pointsContainer;
        const contRect = cont.getBoundingClientRect();
        const draggedRect = draggedRow.getBoundingClientRect();

        // Позиция курсора ОТНОСИТЕЛЬНО контейнера
        const cursorY = e.clientY - contRect.top + cont.scrollTop;

        // Центрируем элемент под курсором
        const newTop = cursorY - draggedRect.height / 2;
        draggedRow.style.top = newTop + 'px';

        /* авто-скролл */
        const zone = 40;
        if (e.clientY < contRect.top + zone) cont.scrollTop -= 15;
        else if (e.clientY > contRect.bottom - zone) cont.scrollTop += 15;

        /* ТОЧНЫЙ поиск места вставки */
        const allRows = [...cont.querySelectorAll('.point-row:not(.dragging):not(.point-row-placeholder)')];
        let tgt = null, insBefore = false;

        for (const r of allRows) {
            const rRect = r.getBoundingClientRect();
            const rCenter = rRect.top + rRect.height / 2; // центр строки

            // Сравниваем с позицией КУРСОРА относительно окна
            if (e.clientY < rCenter) {
                tgt = r;
                insBefore = true;
                break;
            }
            if (e.clientY < rRect.bottom) {
                tgt = r;
                insBefore = false;
                break;
            }
        }

        // Если курсор ниже всех строк - в конец
        if (!tgt && cursorY > cont.scrollHeight - 50) {
            cont.appendChild(placeholder);
        } else if (tgt) {
            cont.insertBefore(placeholder, insBefore ? tgt : tgt.nextSibling);
        }

        updatePointNumbers();
    }



    function onContainerScroll() {
        if (!draggedRow || !mouseY) return;

        // При скролле пересчитываем позицию от текущей mouseY
        const contRect = pointsContainer.getBoundingClientRect();
        const cursorY = mouseY - contRect.top + pointsContainer.scrollTop;
        const draggedRect = draggedRow.getBoundingClientRect();
        const newTop = cursorY - draggedRect.height / 2;

        draggedRow.style.top = newTop + 'px';
    }

    function onMouseUp(e) {
        mouseY = e.clientY;
        if (!draggedRow) return;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        pointsContainer.removeEventListener('scroll', onContainerScroll);

        draggedRow.classList.remove('dragging');
        draggedRow.style.position = '';
        draggedRow.style.width = '';
        draggedRow.style.top = '';
        draggedRow.style.zIndex = '';

        placeholder.parentNode.replaceChild(draggedRow, placeholder);
        placeholder = null;
        draggedRow = null;

        updatePointNumbers();
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
    }

    /* вызываем для каждой строки при создании */
    function initRowDragAndDrop(row) {
        /* было:  row.addEventListener('dragstart', handleDragStart); …
           теперь просто: */
        enableManualDrag(row);
    }



    function updateRowPositions() {
        const rows = Array.from(pointsContainer.querySelectorAll('.point-row:not(.dragging)'));
        rows.forEach((row, index) => {
            row.style.transform = `translateY(0)`;
            row.style.transition = 'transform 0.2s ease-out';
        });
    }

    function removeTrailingEmptyRows() {
        const rows = Array.from(pointsContainer.querySelectorAll('.point-row'));
        while (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            const name = lastRow.querySelector('.pointName').value.trim();
            const coords = lastRow.querySelector('.pointCoords').value.trim();
            if (name === '' && coords === '') {
                lastRow.remove();
                rows.pop();
            } else {
                break;
            }
        }
    }

    function ensureEmptyRowAtEnd() {
        const rows = Array.from(pointsContainer.querySelectorAll('.point-row'));
        if (rows.length === 0) {
            const newRow = addPointRow('', '');
            updatePointNumbers();
            return;
        }
        const lastRow = rows[rows.length - 1];
        const name = lastRow.querySelector('.pointName').value.trim();
        const coords = lastRow.querySelector('.pointCoords').value.trim();
        if (name !== '' || coords !== '') {
            const newRow = addPointRow('', '');
            updatePointNumbers();
        }
    }

    function updatePointNumbers() {
        const rows = pointsContainer.querySelectorAll('.point-row');
        rows.forEach((row, index) => {
            const numSpan = row.querySelector('.point-number');
            if (numSpan) {
                numSpan.textContent = `${index + 1}.`;
            }
        });
    }

    function handleNameInput(e) {
        const input = e.target;
        const value = input.value.trimEnd().toLowerCase();

        const filteredWells = wells
            .filter(w => w.name.toLowerCase().includes(value))
            .sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                if (aName === value) return -1;
                if (bName === value) return 1;
                const aStartsWith = aName.startsWith(value);
                const bStartsWith = bName.startsWith(value);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                const aIndex = aName.indexOf(value);
                const bIndex = bName.indexOf(value);
                const aExtra = aName.length - value.length;
                const bExtra = bName.length - value.length;
                if (aIndex !== bIndex) return aIndex - bIndex;
                return aExtra - bExtra;
            })
            .slice(0, 10);

        if (input._dropdown) {
            input._dropdown.remove();
            input._dropdown = null;
        }

        if (filteredWells.length > 0 && value) {
            const dropdown = document.createElement('div');
            dropdown.classList.add('suggestions');
            document.body.appendChild(dropdown);
            const row = input.closest('.point-row');
            const rowRect = row.getBoundingClientRect();
            const inputRect = input.getBoundingClientRect();
            dropdown.style.top = `${inputRect.bottom + window.pageYOffset}px`;
            dropdown.style.left = `${rowRect.left + window.pageXOffset}px`;
            dropdown.style.width = `${rowRect.width}px`;
            input._dropdown = dropdown;

            filteredWells.forEach((well, index) => {
                const item = document.createElement('div');
                item.textContent = well.name;
                item.dataset.index = index;
                item.addEventListener('mousedown', (evt) => {
                    evt.preventDefault();
                    selectSuggestion(input, well);
                });
                dropdown.appendChild(item);
            });
        }
        input.dataset.selectedIndex = -1;
    }

    function handleKeydown(e) {
        const input = e.target;
        const dropdown = input._dropdown;
        if (!dropdown) return;

        const items = dropdown.querySelectorAll('div');
        let selectedIndex = parseInt(input.dataset.selectedIndex) || -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const well = wells.find(w => w.name === items[selectedIndex].textContent);
            if (well) selectSuggestion(input, well);
            return;
        } else {
            return;
        }

        items.forEach(item => item.classList.remove('selected'));
        if (selectedIndex >= 0) {
            items[selectedIndex].classList.add('selected');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
        input.dataset.selectedIndex = selectedIndex;
    }

    function hideSuggestions(e) {
        const input = e.target;
        if (input._dropdown) {
            input._dropdown.remove();
            input._dropdown = null;
        }
    }

    function selectSuggestion(input, well) {
        input.value = well.name;
        const coordsInput = input.closest('.point-row').querySelector('.pointCoords');
        coordsInput.value = `${well.lat.toFixed(6)}/${well.lon.toFixed(6)}`;
        pushState();
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        hideSuggestions({ target: input });
        const row = input.closest('.point-row');
        setActiveRow(row, true);
        const coord = ol.proj.fromLonLat([well.lon, well.lat]);
        map.getView().animate({
            center: coord,
            duration: 500,
            easing: ol.easing.easeOut
        });
    }

    document.getElementById('addPointButton').addEventListener('click', function () {
        pushState();
        const newRow = addPointRow('', '');
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        setActiveRow(newRow, true);
    });

    document.getElementById('clearButton').addEventListener('click', function () {
        pushState();
        document.getElementById('mapName').value = '';
        pointsContainer.innerHTML = '';
        addPointRow('', '');
        pointIdCounter = 0;
        kmlLineSource.clear();
        updateMap();
        saveDataToLocalStorage();
        updatePointNumbers();
        if (document.getElementById('quickAddModal').classList.contains('show')) {
            updateQuickAddWellList();
        }
    });

    document.getElementById('sortPointsButton').addEventListener('click', function () {
        const pointRows = document.querySelectorAll('.point-row');
        const points = Array.from(pointRows).map(row => {
            const name = row.querySelector('.pointName').value.trim();
            const coords = row.querySelector('.pointCoords').value.trim();
            if (!name || !coords) return null;
            const [latitude, longitude] = coords.split('/').map(parseFloat);
            if (isNaN(latitude) || isNaN(longitude)) return null;
            return { name, lat: latitude, lon: longitude };
        }).filter(p => p !== null);

        if (points.length === 0) {
            showNotification('Нет точек для сортировки.');
            return;
        }

        window.preserveKmlLinesDuringSort = kmlWithLinesMode;

        window.tempPointsForSorting = points;
        window.tempMapNameForSorting = document.getElementById('mapName').value || 'Imported Map';

        opener.showStartPointModal(window.tempMapNameForSorting, points);
    });


    function selectStartPoint(item) {
        const startName = item.textContent;

        startPointModal.classList.remove('show');
        document.getElementById('startPointModalBackdrop').classList.remove('show');
        setTimeout(() => {
            startPointModal.style.display = 'none';
            document.getElementById('startPointModalBackdrop').style.display = 'none';
            startPointList.innerHTML = '';
            startPointList.dataset.selectedIndex = -1;
        }, 300);

        let pointsToSort = [];
        let mapNameToUse = '';

        if (window.tempPointsForSorting) {
            pointsToSort = window.tempPointsForSorting;
            mapNameToUse = window.tempMapNameForSorting;
            delete window.tempPointsForSorting;
            delete window.tempMapNameForSorting;
        } else if (opener.points && opener.points.length > 0) {
            pointsToSort = opener.points;
            mapNameToUse = opener.mapName;
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
        } else {
            showNotification('Нет данных для сортировки.');
            return;
        }

        const sortedPoints = opener.sortPoints(startName, pointsToSort, null);

        const preserveKmlLines = !!window.preserveKmlLinesDuringSort;
        delete window.preserveKmlLinesDuringSort;

        loadPointsIntoUI(sortedPoints, mapNameToUse);

        kmlWithLinesMode = false;
        kmlLineLayer.setVisible(preserveKmlLines);

        updateMap();
    }
    function saveMapToHistory(mapName, points, kmlContent) {
        const pointsForHistory = points.map(p => ({
            name: p.name,
            lat: p.latitude,
            lon: p.longitude
        }));

        const entry = {
            id: Date.now(),
            name: mapName,
            points: pointsForHistory,
            timestamp: new Date().toLocaleString('ru-RU')
        };

        let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        history.unshift(entry); // Добавляем в начало для сортировки по новизне
        if (history.length > 50) {
            history = history.slice(0, 50); // Ограничиваем 50 записями
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
    document.getElementById('generateKMLButton').addEventListener('click', function () {
        const mapName = document.getElementById('mapName').value;

        if (!mapName) {
            showNotification('Пожалуйста, введите название карты.');
            return;
        }

        const pointRows = document.querySelectorAll('.point-row');
        const points = Array.from(pointRows).map(row => {
            const name = row.querySelector('.pointName').value.trim();
            const coords = row.querySelector('.pointCoords').value.trim();
            if (!name || !coords) return null;
            const [latitude, longitude] = coords.split('/').map(parseFloat);
            if (isNaN(latitude) || isNaN(longitude)) return null;
            return { name, latitude, longitude };
        }).filter(p => p !== null);

        if (points.length === 0) {
            alert('Пожалуйста, добавьте как минимум одну точку перед созданием KML.');
            return;
        }

        // Helper function to escape XML special characters
        function escapeXml(unsafe) {
            return unsafe.replace(/[<>&'"]/g, function (c) {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '\'': return '&apos;';
                    case '"': return '&quot;';
                    default: return c;
                }
            });
        }

        let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>${escapeXml(mapName)}</name>
`;

        let cumulativeDistance = 0;

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            let distanceText = '';
            if (i > 0) {
                const from = turf.point([points[i - 1].longitude, points[i - 1].latitude]);
                const to = turf.point([point.longitude, point.latitude]);
                const options = { units: 'meters' };
                const distance = turf.distance(from, to, options);
                cumulativeDistance += distance;
                distanceText = ` - ${Math.round(cumulativeDistance)} м`;
            }

            kmlContent += `
        <Placemark>
            <name>${escapeXml(point.name)}${escapeXml(distanceText)}</name>
            <Point>
                <coordinates>${point.longitude},${point.latitude}</coordinates>
            </Point>
        </Placemark>
    `;
        }

        if (points.length > 1) {
            let lineStringCoords = points.map(point => `${point.longitude},${point.latitude}`).join(' ');
            kmlContent += `
        <Placemark>
            <name>${escapeXml('Route')}</name>
            <LineString>
                <coordinates>${lineStringCoords}</coordinates>
            </LineString>
        </Placemark>
    `;
        }

        kmlContent += `
    </Document>
</kml>`;

        // Save to history
        saveMapToHistory(mapName, points, kmlContent);

        const kmlData = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
        const kmlURL = URL.createObjectURL(kmlData);

        // Sanitize filename to allow Russian letters and hyphens, but remove other special characters
        const sanitizedFileName = mapName
            .replace(/[^\p{L}\p{N}\- ]/gu, '') // Allow Unicode letters, numbers, hyphens, and spaces
            .trim()
            .replace(/\s+/g, '_'); // Replace spaces with underscores

        const link = document.createElement('a');
        link.href = kmlURL;
        link.download = `${sanitizedFileName || 'map'}.kml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(kmlURL);
        fetch('/api/history/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: mapName,
                kml: kmlContent
            })
        })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    console.log('Saved to shared history:', result.filename);
                } else {
                    console.error('Failed to save to shared history:', result.error);
                }
            })
            .catch(error => {
                console.error('Error saving to shared history:', error);
            });


    });


    function handleKmlWithoutLines(kmlText) {
        window.kmlLineSource.clear();
        const parsed = opener.parseKML(kmlText);
        if (parsed === null) {
            loadPointsIntoUI(opener.points, opener.mapName);
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
            return;
        }
        if (!parsed || !parsed.points || parsed.points.length === 0) {
            alert('В KML файле не найдены точки.');
            return;
        }
        opener.points = parsed.points;
        opener.lineCoords = parsed.lineCoords;
        opener.mapName = parsed.mapName;
        kmlWithLinesMode = false;
        kmlLineLayer.setVisible(false);
        loadPointsIntoUI(opener.points, opener.mapName);
    }

    function handleKmlWithLines(kmlText) {
        const parsed = opener.parseKML(kmlText);
        if (parsed === null) return;
        loadPointsIntoUI(parsed.points, parsed.mapName);
        opener.loadKmlLinesIntoMap(parsed.lineCoordsList);
        document.getElementById('sortPointsButton').style.display = 'inline-block';
        kmlWithLinesMode = true;
        kmlLineLayer.setVisible(true);
        lineSource.clear(); // Очищаем красную линию
    }

    function updateMap() {
        vectorSource.clear();
        lineSource.clear();

        const pointRows = document.querySelectorAll('.point-row');
        const coordinates = [];
        let cumulativeDistance = 0;
        let previousCoords = null;

        pointRows.forEach((row, index) => {
            const coords = row.querySelector('.pointCoords').value;
            const name = row.querySelector('.pointName').value;
            const pointId = row.dataset.pointId;

            if (coords) {
                const [latitude, longitude] = coords.split('/').map(parseFloat);
                if (!isNaN(latitude) && !isNaN(longitude)) {
                    const currentCoords = [longitude, latitude];
                    let distanceText = '';
                    if (previousCoords) {
                        const from = turf.point(previousCoords);
                        const to = turf.point([longitude, latitude]);
                        const options = { units: 'meters' };
                        const distance = turf.distance(from, to, options);
                        cumulativeDistance += distance;
                        distanceText = ` - ${Math.round(cumulativeDistance)} м`;
                    }

                    // Добавляем порядковый номер к имени точки
                    const displayName = name ? `${index + 1}. ${name}` : `${index + 1}.`;

                    const feature = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([longitude, latitude])),
                        name: displayName + distanceText,
                        pointId: pointId,
                        active: row.classList.contains('active')
                    });

                    vectorSource.addFeature(feature);
                    coordinates.push(ol.proj.fromLonLat([longitude, latitude]));

                    previousCoords = [longitude, latitude];
                }
            }
        });

        // Рисуем красную линию только если kmlWithLinesMode === false
        if (!kmlWithLinesMode && coordinates.length > 1) {
            const line = new ol.Feature({
                geometry: new ol.geom.LineString(coordinates)
            });
            lineSource.addFeature(line);
        }

        document.getElementById('totalDistance').textContent = `Общая длина: ${Math.round(cumulativeDistance)} м`;
        updatePointNumbers();
    }
    document.getElementById('loadWithLinesBtn').addEventListener('click', function () {
        closeLineChoiceModal();
        if (window.pendingKmlData) {
            handleKmlWithLines(window.pendingKmlData.kmlText);
            window.pendingKmlData = null;
        }
    });

    document.getElementById('loadWithoutLinesBtn').addEventListener('click', function () {
        closeLineChoiceModal();
        if (window.pendingKmlData) {
            handleKmlWithoutLines(window.pendingKmlData.kmlText);
            window.pendingKmlData = null;
        }
    });

    document.getElementById('lineChoiceClose').addEventListener('click', function () {
        closeLineChoiceModal();
        window.pendingKmlData = null;
    });

    function closeLineChoiceModal() {
        const modal = document.getElementById('lineChoiceModal');
        const backdrop = document.getElementById('lineChoiceModalBackdrop');
        modal.classList.remove('show');
        backdrop.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            backdrop.style.display = 'none';
        }, 300);
    }




    function updateMap() {
        vectorSource.clear();
        lineSource.clear();

        const pointRows = document.querySelectorAll('.point-row');
        const coordinates = [];
        let cumulativeDistance = 0;
        let previousCoords = null;

        pointRows.forEach((row, index) => {
            const coords = row.querySelector('.pointCoords').value;
            const name = row.querySelector('.pointName').value;
            const pointId = row.dataset.pointId;

            if (coords) {
                const [latitude, longitude] = coords.split('/').map(parseFloat);
                if (!isNaN(latitude) && !isNaN(longitude)) {
                    const currentCoords = [longitude, latitude];
                    let distanceText = '';
                    if (previousCoords) {
                        const from = turf.point(previousCoords);
                        const to = turf.point([longitude, latitude]);
                        const options = { units: 'meters' };
                        const distance = turf.distance(from, to, options);
                        cumulativeDistance += distance;
                        distanceText = ` - ${Math.round(cumulativeDistance)} м`;
                    }

                    // Добавляем порядковый номер к имени точки
                    const displayName = name ? `${index + 1}. ${name}` : `${index + 1}.`;

                    const feature = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([longitude, latitude])),
                        name: displayName + distanceText,
                        pointId: pointId,
                        active: row.classList.contains('active')
                    });

                    vectorSource.addFeature(feature);
                    coordinates.push(ol.proj.fromLonLat([longitude, latitude]));

                    previousCoords = [longitude, latitude];
                }
            }
        });

        lineSource.clear();
        if (!kmlWithLinesMode && coordinates.length > 1) {
            const line = new ol.Feature({
                geometry: new ol.geom.LineString(coordinates)
            });
            lineSource.addFeature(line);
        }
        document.getElementById('totalDistance').textContent = `Общая длина: ${Math.round(cumulativeDistance)} м`;
        updatePointNumbers();
    }

    function fitToPoints() {
        const extent = vectorSource.getExtent();
        if (!ol.extent.isEmpty(extent)) {
            map.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                duration: 500,
                maxZoom: 15
            });
        }
    }

    function pushState() {
        const state = {
            mapName: mapNameInput.value,
            points: Array.from(document.querySelectorAll('.point-row')).map(row => ({
                pointId: parseInt(row.dataset.pointId),
                name: row.querySelector('.pointName').value,
                coords: row.querySelector('.pointCoords').value
            })),
            wells: JSON.parse(JSON.stringify(wells)),
            activePointId: document.querySelector('.point-row.active')?.dataset.pointId
        };
        history.push(state);
    }

    function restoreState(state) {
        pointsContainer.innerHTML = '';
        pointIdCounter = 0;
        const addedRows = state.points.map(p => {
            const row = addPointRow(p.name, p.coords, p.pointId);
            if (p.pointId >= pointIdCounter) pointIdCounter = p.pointId + 1;
            return { pointId: p.pointId, row };
        });
        mapNameInput.value = state.mapName;
        wells = state.wells;
        updateMap();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        if (document.getElementById('quickAddModal').classList.contains('show')) {
            updateQuickAddWellList();
        }

        let pointIdToHighlight = state.activePointId;
        if (!pointIdToHighlight && addedRows.length > 0) {
            pointIdToHighlight = addedRows[0].pointId;
        }

        if (pointIdToHighlight) {
            const rowEntry = addedRows.find(r => r.pointId === pointIdToHighlight);
            if (rowEntry) {
                setActiveRow(rowEntry.row, false);
            }
        }
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.code === 'KeyZ') {
            e.preventDefault();
            if (history.length > 0) {
                const prevState = history.pop();
                restoreState(prevState);
            }
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const activeRow = document.querySelector('.point-row.active');
        if (!activeRow) return;

        const digitMatch = e.key.match(/^([0-9])$/);
        if (digitMatch) {
            e.preventDefault();
            const digit = digitMatch[1];
            digitInputBuffer += digit;

            if (digitInputTimeout) clearTimeout(digitInputTimeout);
            digitInputTimeout = setTimeout(() => {
                const allRows = Array.from(document.querySelectorAll('.point-row'));
                const filledRows = allRows.filter(row => {
                    const name = row.querySelector('.pointName').value.trim();
                    const coords = row.querySelector('.pointCoords').value.trim();
                    return name !== '' || coords !== '';
                });
                const maxIndex = allRows.length - 1;

                let targetIndex;

                if (digitInputBuffer === '0') {
                    if (window.lastZeroInsertIndex !== null) {
                        // Используем последний введённый номер + 1
                        targetIndex = window.lastZeroInsertIndex + 1;
                    } else {
                        // Если последнего номера нет, выбираем 2 (или 0, если нет заполненных строк)
                        targetIndex = filledRows.length > 0 ? 1 : 0;
                    }
                    window.lastZeroInsertIndex = targetIndex; // Обновляем последний введённый номер
                } else {
                    const num = parseInt(digitInputBuffer, 10);
                    targetIndex = num - 1; // 1-based to 0-based
                    window.lastZeroInsertIndex = targetIndex; // Сохраняем введённый номер
                }

                digitInputBuffer = '';

                // Ограничиваем targetIndex до допустимого диапазона
                targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));

                const currentIndex = allRows.indexOf(activeRow);
                if (currentIndex === targetIndex) return;

                pushState();
                activeRow.remove();

                // Корректируем targetIndex, если текущая строка была удалена до или на позиции targetIndex
                if (currentIndex <= targetIndex && targetIndex < maxIndex) {
                    targetIndex++;
                }

                // Вставляем строку в нужную позицию
                if (targetIndex < allRows.length) {
                    pointsContainer.insertBefore(activeRow, allRows[targetIndex]);
                } else {
                    pointsContainer.appendChild(activeRow);
                }

                updatePointNumbers();
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                setActiveRow(activeRow, true);
            }, 300);
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const allRows = Array.from(document.querySelectorAll('.point-row'));
            const currentIndex = allRows.indexOf(activeRow);
            const maxIndex = allRows.length - 2;
            if (currentIndex < 0 || currentIndex > maxIndex) return;

            let newIndex;
            if (e.key === 'ArrowUp') {
                newIndex = currentIndex - 1;
                if (newIndex < 0) return;
            } else {
                newIndex = currentIndex + 1;
                if (newIndex > maxIndex) return;
            }

            pushState();
            const targetRow = allRows[newIndex];
            activeRow.remove();

            if (e.key === 'ArrowUp') {
                targetRow.before(activeRow);
            } else {
                targetRow.after(activeRow);
            }

            updatePointNumbers();
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            setActiveRow(activeRow, true);
        }
    });

    function saveDataToLocalStorage() {
        const mapName = mapNameInput.value;
        localStorage.setItem(MAP_NAME_KEY, mapName);

        const points = [];
        const pointRows = document.querySelectorAll('.point-row');
        pointRows.forEach(row => {
            const name = row.querySelector('.pointName').value;
            const coords = row.querySelector('.pointCoords').value;
            if (name.trim() !== '' || coords.trim() !== '') {
                points.push({ name, coords });
            }
        });
        localStorage.setItem(POINTS_KEY, JSON.stringify(points));
    }

    function loadDataFromLocalStorage() {
        const mapName = localStorage.getItem(MAP_NAME_KEY);
        if (mapName) {
            mapNameInput.value = mapName;
        }

        const pointsData = localStorage.getItem(POINTS_KEY);
        if (pointsData) {
            const points = JSON.parse(pointsData);
            pointsContainer.innerHTML = '';
            points.forEach(point => {
                addPointRow(point.name, point.coords);
            });
            updateMap();
            fitToPoints();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
        } else {
            ensureEmptyRowAtEnd();
            updatePointNumbers();
        }
    }


    function loadPointsIntoUI(pointsToLoad, mapName) {
        pointsContainer.innerHTML = '';
        pointIdCounter = 0;
        pointsToLoad.forEach(point => {
            const lat = point.latitude !== undefined ? point.latitude : point.lat;
            const lon = point.longitude !== undefined ? point.longitude : point.lon;
            if (typeof lat === 'number' && !isNaN(lat) && typeof lon === 'number' && !isNaN(lon)) {
                addPointRow(point.name || '', `${lat.toFixed(6)}/${lon.toFixed(6)}`);
            } else {
                console.warn(`Skipping invalid point: ${JSON.stringify(point)}`);
            }
        });
        if (mapName) {
            mapNameInput.value = mapName;
        }
        updateMap();
        fitToPoints();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        // Удалено: document.getElementById('sortPointsButton').style.display = 'none';
    }

    loadDataFromLocalStorage();

    mapNameInput.addEventListener('input', function () {
        debounce(saveDataToLocalStorage, 500);
    });



    document.getElementById('loadWellsButton').addEventListener('click', () => {
        // просто вызываем стандартный диалог выбора файла
        document.getElementById('universalFileInput').click();
    });

    /* 3. Единый обработчик файла (KML или XLSX) */
    document.getElementById('universalFileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'kml') {
            const reader = new FileReader();
            reader.onload = evt => {
                const kmlText = evt.target.result;
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
                const hasLineString = !!kmlDoc.querySelector('LineString');

                if (hasLineString) {
                    // показываем выбор «с линиями / без»
                    window.pendingKmlData = { kmlText, kmlDoc };
                    const modal = document.getElementById('lineChoiceModal');
                    const backdrop = document.getElementById('lineChoiceModalBackdrop');
                    modal.style.display = backdrop.style.display = 'block';
                    setTimeout(() => { modal.classList.add('show'); backdrop.classList.add('show'); }, 0);
                } else {
                    handleKmlWithoutLines(kmlText);
                }
            };
            reader.readAsText(file);
        }

        else if (ext === 'xlsx') {
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const sh = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: false });
                    if (rows.length < 2) throw new Error('Таблица пуста или содержит только заголовок');

                    const hdr = rows[0].map(c => String(c || '').toLowerCase());
                    const nameIdx = hdr.findIndex(c => c.includes('название') || c.includes('name'));
                    const latIdx = hdr.findIndex(c => c.includes('lat'));
                    const lonIdx = hdr.findIndex(c => c.includes('lon') || c.includes('long'));

                    if (nameIdx === -1 || latIdx === -1 || lonIdx === -1)
                        throw new Error('Не найдены столбцы: Название, lat, lon');

                    const loadedWells = [];
                    for (let i = 1; i < rows.length; i++) {
                        const r = rows[i];
                        const w = {
                            name: (r[nameIdx] || '').toString().trim(),
                            lat: parseFloat(r[latIdx]),
                            lon: parseFloat(r[lonIdx])
                        };
                        if (w.name && !isNaN(w.lat) && !isNaN(w.lon)) loadedWells.push(w);
                    }

                    // 1. сохраняем в sessionStorage
                    saveWellsToSessionStorage(loadedWells);

                    // 2. сразу обновляем оперативную переменную
                    wells = loadedWells;

                    // 3. обновляем UI, если окно быстрого добавления открыто
                    if (document.getElementById('quickAddModal').classList.contains('show')) {
                        updateQuickAddWellList();
                    }

                    showNotification(`Загружено колодцев: ${wells.length}`);
                } catch (err) {
                    alert('Ошибка обработки XLSX: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        }

        else {
            alert('Поддерживаются только .kml и .xlsx файлы');
        }

        // очищаем input, чтобы можно было выбрать тот же файл снова
        e.target.value = '';
    });





    function saveWellsToSessionStorage(wellsArray) {
        try {
            if (!wellsArray || wellsArray.length === 0) {
                sessionStorage.removeItem('kml_generator_wells');
                return;
            }

            // Сжимаем только необходимые поля и округляем координаты
            const compactWells = wellsArray.map(w => ({
                name: w.name,
                lat: parseFloat(w.lat.toFixed(5)), // 5 знаков ≈ 1 м точности
                lon: parseFloat(w.lon.toFixed(5))
            }));

            const json = JSON.stringify(compactWells);
            const compressed = LZString.compressToUTF16(json); // компактный, безопасный для Storage
            sessionStorage.setItem('kml_generator_wells', compressed);
        } catch (e) {
            console.warn('Не удалось сохранить wells в sessionStorage (сжатие):', e.message);
        }
    }

    function loadWellsFromSessionStorage() {
        try {
            const compressed = sessionStorage.getItem('kml_generator_wells');
            if (!compressed) return [];
            const json = LZString.decompressFromUTF16(compressed);
            if (!json) return [];
            const wells = JSON.parse(json);
            // Убеждаемся, что lat/lon — числа
            return wells.map(w => ({
                name: w.name || '',
                lat: typeof w.lat === 'number' ? w.lat : parseFloat(w.lat),
                lon: typeof w.lon === 'number' ? w.lon : parseFloat(w.lon)
            })).filter(w => w.name && !isNaN(w.lat) && !isNaN(w.lon));
        } catch (e) {
            console.warn('Не удалось загрузить wells из sessionStorage (сжатие):', e.message);
            return [];
        }
    }
    // --- КОНЕЦ ЗАМЕНЫ ---


    // --- НАЧАЛО: Логика модального окна "Дополнительно" ---

    const advancedModal = document.getElementById('advancedModal');
    const advancedModalBackdrop = document.getElementById('advancedModalBackdrop');
    const advancedCloseButton = document.getElementById('advancedClose');
    const advancedOptionsList = document.getElementById('advancedOptionsList');
    // Находим элемент <h1> внутри <div class="main">
    const kmlGeneratorTitle = document.querySelector('.main h1'); // Изменённый селектор

    if (!kmlGeneratorTitle) {
        console.error('Элемент заголовка .main h1 не найден для добавления dblclick обработчика.');
    } else {
        // Функция для открытия модального окна
        function openAdvancedModal() {
            advancedModal.style.display = 'block';
            advancedModalBackdrop.style.display = 'block';
            setTimeout(() => {
                advancedModal.classList.add('show');
                advancedModalBackdrop.classList.add('show');
            }, 0);
            updateAdvancedOptionsList(); // Заполняем список при открытии
        }

        // Функция для закрытия модального окна
        function closeAdvancedModal() {
            advancedModal.classList.remove('show');
            advancedModalBackdrop.classList.remove('show');
            setTimeout(() => {
                advancedModal.style.display = 'none';
                advancedModalBackdrop.style.display = 'none';
                // Очищаем список при закрытии (по желанию)
                advancedOptionsList.innerHTML = '';
            }, 300);
        }

        // Функция для обновления списка опций
        function updateAdvancedOptionsList() {
            advancedOptionsList.innerHTML = ''; // Очищаем перед заполнением

            // Пункт 1: Загрузить расширение
            const loadExtensionItem = document.createElement('div');
            loadExtensionItem.className = 'well-item';
            loadExtensionItem.textContent = 'Загрузить расширение';
            loadExtensionItem.addEventListener('click', () => {
                window.open('https://onedrive.rt.ru/personal/uf_kozubov_aleksandr/Documents/%D0%94%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%BD%D0%BE%20%D0%B2%D1%81%D0%B5%D0%BC/KML-generate/extensions/argushelper.zip', '_blank'); // Замените URL на нужный
                closeAdvancedModal(); // Закрываем модальное окно после открытия вкладки
            });
            advancedOptionsList.appendChild(loadExtensionItem);

            // Пункт 2: Очистить данные
            const clearDataItem = document.createElement('div');
            clearDataItem.className = 'well-item';
            clearDataItem.textContent = 'Очистить данные';
            clearDataItem.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите очистить все данные (localStorage)? Это действие нельзя отменить.')) {
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                        showNotification('Данные очищены. Страница будет перезагружена.');
                        // Жесткая перезагрузка с игнорированием кеша
                        window.location.reload(true);
                    } catch (e) {
                        console.error('Ошибка при очистке localStorage:', e);
                        alert('Произошла ошибка при очистке данных.');
                    }
                }
                // Закрываем модальное окно в любом случае
                closeAdvancedModal();
            });
            advancedOptionsList.appendChild(clearDataItem);

            // Если нужны другие элементы, добавляйте их здесь
        }

        // Обработчик двойного клика по элементу заголовка <h1>
        kmlGeneratorTitle.addEventListener('dblclick', function (event) {
            event.preventDefault(); // Предотвращаем возможные побочные эффекты двойного клика
            openAdvancedModal();
        });

        // Обработчики закрытия модального окна
        advancedCloseButton.addEventListener('click', closeAdvancedModal);
        advancedModalBackdrop.addEventListener('click', function (e) {
            if (e.target === advancedModalBackdrop) {
                closeAdvancedModal();
            }
        });
    }

    // --- КОНЕЦ: Логика модального окна "Дополнительно" ---

    // --- НАЧАЛО: Запрет копирования для .main h1 ---
    if (kmlGeneratorTitle) {
        // Отключить выделение текста
        kmlGeneratorTitle.style.userSelect = 'none';
        kmlGeneratorTitle.style.webkitUserSelect = 'none';
        kmlGeneratorTitle.style.mozUserSelect = 'none';
        kmlGeneratorTitle.style.msUserSelect = 'none';

        // Отключить контекстное меню (клик правой кнопкой)
        kmlGeneratorTitle.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
    }

    // --- КОНЕЦ: Логика модального окна "Дополнительно" ---


    const quickAddModal = document.getElementById('quickAddModal');
    const quickAddSearch = document.getElementById('quickAddSearch');
    const quickAddWellList = document.getElementById('quickAddWellList');
    const quickAddClose = document.getElementById('quickAddClose');
    const quickAddButton = document.getElementById('quickAddButton');

    quickAddButton.addEventListener('click', function () {
        quickAddModal.style.display = 'block';
        setTimeout(() => {
            quickAddModal.classList.add('show');
            quickAddSearch.dataset.selectedIndex = -1;
            updateQuickAddWellList();
            quickAddSearch.focus();
        }, 0);
        console.log('Quick Add Modal opened');
    });

    quickAddClose.addEventListener('click', function (event) {
        event.stopPropagation();
        quickAddModal.classList.remove('show');
        setTimeout(() => {
            quickAddModal.style.display = 'none';
            quickAddWellList.innerHTML = '';
            quickAddSearch.value = '';
            quickAddSearch.dataset.selectedIndex = -1;
            console.log('Quick Add Modal closed');
        }, 300);
    });

    let wellsToShow = [];

    quickAddSearch.addEventListener('input', function () {
        quickAddSearch.dataset.selectedIndex = -1;
        updateQuickAddWellList();
    });

    quickAddSearch.addEventListener('keydown', function (e) {
        const items = quickAddWellList.querySelectorAll('.well-item');
        let selectedIndex = parseInt(quickAddSearch.dataset.selectedIndex) || -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectQuickAddSuggestion(wellsToShow[selectedIndex]);
            return;
        } else {
            return;
        }

        items.forEach(item => item.classList.remove('selected'));
        if (selectedIndex >= 0) {
            items[selectedIndex].classList.add('selected');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
        quickAddSearch.dataset.selectedIndex = selectedIndex;
    });

    function updateQuickAddWellList() {
        const value = quickAddSearch.value.trim().toLowerCase();
        quickAddWellList.innerHTML = '';

        const addedWellNames = new Set();
        const pointRows = document.querySelectorAll('.point-row');
        pointRows.forEach(row => {
            const name = row.querySelector('.pointName').value.trim();
            if (name) {
                addedWellNames.add(name.toLowerCase());
            }
        });

        let lastCoords = null;
        for (let i = pointRows.length - 1; i >= 0; i--) {
            const coords = pointRows[i].querySelector('.pointCoords').value.trim();
            if (coords) {
                const [lat, lon] = coords.split('/').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                    lastCoords = { lat, lon };
                    break;
                }
            }
        }

        wellsToShow = wells.filter(w => {
            const matchesSearch = value ? w.name.toLowerCase().includes(value) : true;
            const notAdded = !addedWellNames.has(w.name.toLowerCase());
            return matchesSearch && notAdded;
        });

        if (wellsToShow.length === 0) {
            const item = document.createElement('div');
            item.textContent = 'Нет доступных колодцев';
            item.style.padding = '8px';
            item.style.color = '#888';
            item.style.fontStyle = 'italic';
            item.style.textAlign = 'center';
            quickAddWellList.appendChild(item);
            quickAddSearch.dataset.selectedIndex = -1;
            return;
        }

        if (lastCoords) {
            wellsToShow.sort((a, b) => {
                const distA = turf.distance(turf.point([lastCoords.lon, lastCoords.lat]), turf.point([a.lon, a.lat]), { units: 'meters' });
                const distB = turf.distance(turf.point([lastCoords.lon, lastCoords.lat]), turf.point([b.lon, b.lat]), { units: 'meters' });
                return distA - distB;
            });
        } else if (value) {
            wellsToShow.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                if (aName === value) return -1;
                if (bName === value) return 1;
                const aStartsWith = aName.startsWith(value);
                const bStartsWith = bName.startsWith(value);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                const aIndex = aName.indexOf(value);
                const bIndex = bName.indexOf(value);
                const aExtra = aName.length - value.length;
                const bExtra = bName.length - value.length;
                if (aIndex !== bIndex) return aIndex - bIndex;
                return aExtra - bExtra;
            });
        } else {
            wellsToShow.sort((a, b) => a.name.localeCompare(b.name));
        }

        wellsToShow = wellsToShow.slice(0, value ? 40 : 15);

        wellsToShow.forEach((well, index) => {
            const item = document.createElement('div');
            item.textContent = well.name;
            item.className = 'well-item';
            item.dataset.index = index;
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '6px';
            item.style.transition = 'background-color 0.2s';
            item.addEventListener('click', function () {
                selectQuickAddSuggestion(well);
            });
            quickAddWellList.appendChild(item);
        });
    }

    function selectQuickAddSuggestion(well) {
        if (well) {
            pushState();
            const newRow = addPointRow(well.name, `${well.lat.toFixed(6)}/${well.lon.toFixed(6)}`);
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
            setActiveRow(newRow, true);
            const coord = ol.proj.fromLonLat([well.lon, well.lat]);
            map.getView().animate({
                center: coord,
                duration: 500,
                easing: ol.easing.easeOut
            });
            updateQuickAddWellList();
        }
    }

    function makeModalDraggable(modalId, positionKey) {
        if (modalId !== 'quickAddModal') return;

        const modal = document.getElementById(modalId);
        const content = modal.querySelector('.modal-content');
        const header = modal.querySelector('.modal-header');
        const closeButton = modal.querySelector('.close-modal');

        let isDragging = false;
        let offsetX, offsetY;
        let currentX = 0;
        let currentY = 0;

        const saved = localStorage.getItem(positionKey);
        let isValidPosition = false;
        if (saved) {
            try {
                const { x, y } = JSON.parse(saved);
                const maxX = window.innerWidth - (content.offsetWidth || 400);
                const maxY = window.innerHeight - (content.offsetHeight || 300);
                if (x >= 0 && x <= maxX && y >= 0 && y <= maxY) {
                    currentX = x;
                    currentY = y;
                    isValidPosition = true;
                }
            } catch (e) {
                console.error('Invalid saved modal position:', e);
            }
        }

        if (!isValidPosition) {
            currentX = (window.innerWidth - (content.offsetWidth || 400)) / 2;
            currentY = (window.innerHeight - (content.offsetHeight || 300)) / 2;
            localStorage.setItem(positionKey, JSON.stringify({ x: currentX, y: currentY }));
        }

        positionModal();

        function positionModal() {
            content.style.position = 'absolute';
            content.style.left = '0';
            content.style.top = '0';
            content.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }

        function boundPosition() {
            const maxX = window.innerWidth - (content.offsetWidth || 400);
            const maxY = window.innerHeight - (content.offsetHeight || 300);
            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));
        }

        header.addEventListener('mousedown', (e) => {
            if (e.target !== closeButton) {
                isDragging = true;
                const rect = content.getBoundingClientRect();
                offsetX = e.clientX - (rect.left + window.pageXOffset);
                offsetY = e.clientY - (rect.top + window.pageYOffset);
                content.style.zIndex = 2001;
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            currentX = e.clientX - offsetX;
            currentY = e.clientY - offsetY;
            boundPosition();
            content.style.transform = `translate(${currentX}px, ${currentY}px)`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                boundPosition();
                localStorage.setItem(positionKey, JSON.stringify({ x: currentX, y: currentY }));
            }
        });

        window.addEventListener('resize', () => {
            boundPosition();
            content.style.transform = `translate(${currentX}px, ${currentY}px)`;
            localStorage.setItem(positionKey, JSON.stringify({ x: currentX, y: currentY }));
        });
    }

    makeModalDraggable('quickAddModal', 'quickAddModalPosition');

    const startPointModal = document.getElementById('startPointModal');
    const startPointList = document.getElementById('startPointList');
    const startPointClose = document.getElementById('startPointClose');

    startPointClose.addEventListener('click', function () {
        startPointModal.classList.remove('show');
        document.getElementById('startPointModalBackdrop').classList.remove('show');
        setTimeout(() => {
            startPointModal.style.display = 'none';
            document.getElementById('startPointModalBackdrop').style.display = 'none';
            startPointList.innerHTML = '';
            startPointList.dataset.selectedIndex = -1;
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
            console.log('Start Point Modal closed');
        }, 300);
    });

    startPointList.addEventListener('click', function (e) {
        const item = e.target.closest('.well-item');
        if (item) {
            console.log('Start Point Modal button clicked:', item.textContent);
            selectStartPoint(item);
        }
    });

    startPointList.addEventListener('keydown', function (e) {
        const items = startPointList.querySelectorAll('.well-item');
        let selectedIndex = parseInt(startPointList.dataset.selectedIndex) || -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectStartPoint(items[selectedIndex]);
            return;
        } else {
            return;
        }

        items.forEach(item => item.classList.remove('selected'));
        if (selectedIndex >= 0) {
            items[selectedIndex].classList.add('selected');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
        startPointList.dataset.selectedIndex = selectedIndex;
    });

    function selectStartPoint(item) {
        const startName = item.textContent;

        // Закрываем модалку
        startPointModal.classList.remove('show');
        document.getElementById('startPointModalBackdrop').classList.remove('show');
        setTimeout(() => {
            startPointModal.style.display = 'none';
            document.getElementById('startPointModalBackdrop').style.display = 'none';
            startPointList.innerHTML = '';
            startPointList.dataset.selectedIndex = -1;
        }, 300);

        // Определяем источник точек
        let pointsToSort = [];
        let mapNameToUse = '';

        if (window.tempPointsForSorting) {
            // Случай: сортировка после загрузки KML с линиями
            pointsToSort = window.tempPointsForSorting;
            mapNameToUse = window.tempMapNameForSorting;
            delete window.tempPointsForSorting;
            delete window.tempMapNameForSorting;
        } else if (opener.points && opener.points.length > 0) {
            // Случай: стандартная загрузка без линий
            pointsToSort = opener.points;
            mapNameToUse = opener.mapName;
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
        } else {
            alert('Нет данных для сортировки.');
            return;
        }

        // Сортируем
        const sortedPoints = opener.sortPoints(startName, pointsToSort, null);
        loadPointsIntoUI(sortedPoints, mapNameToUse);

        // Включаем режим сортировки → теперь можно рисовать красную линию
        kmlWithLinesMode = false;
        updateMap(); // перерисовать без линии KML, но с возможностью красной
    }

    const historyButton = document.getElementById('historyButton');
    const historyModal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    const historyModalClose = document.getElementById('historyModalClose');
    const clearHistoryButton = document.getElementById('clearHistoryButton');

    historyButton.addEventListener('click', function () {
        historyModal.style.display = 'block';
        document.getElementById('historyModalBackdrop').style.display = 'block';
        setTimeout(() => {
            historyModal.classList.add('show');
            document.getElementById('historyModalBackdrop').classList.add('show');
            updateHistoryList();
        }, 0);
        console.log('History Modal opened');
    });

    historyModalClose.addEventListener('click', function (event) {
        event.stopPropagation();
        historyModal.classList.remove('show');
        document.getElementById('historyModalBackdrop').classList.remove('show');
        setTimeout(() => {
            historyModal.style.display = 'none';
            document.getElementById('historyModalBackdrop').style.display = 'none';
            historyList.innerHTML = '';
            historyList.dataset.selectedIndex = -1;
            console.log('History Modal closed');
        }, 300);
    });

    clearHistoryButton.addEventListener('click', function (event) {
        event.stopPropagation();
        if (confirm('Вы уверены, что хотите очистить всю историю?')) {
            localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
            updateHistoryList();
            console.log('History cleared');
        }
    });

    historyList.addEventListener('click', function (e) {
        const item = e.target.closest('.history-item');
        const deleteButton = e.target.closest('.delete-history-item');
        if (deleteButton) {
            const id = parseInt(deleteButton.dataset.id);
            let mapHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            mapHistory = mapHistory.filter(entry => entry.id !== id);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(mapHistory));
            updateHistoryList();
            console.log(`History item ${id} deleted`);
        } else if (item) {
            const id = parseInt(item.dataset.id);
            loadHistoryItem(id);
        }
    });

    historyList.addEventListener('keydown', function (e) {
        const items = historyList.querySelectorAll('.history-item');
        let selectedIndex = parseInt(historyList.dataset.selectedIndex) || -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const id = parseInt(items[selectedIndex].dataset.id);
            loadHistoryItem(id);
            return;
        } else {
            return;
        }

        items.forEach(item => item.classList.remove('selected'));
        if (selectedIndex >= 0) {
            items[selectedIndex].classList.add('selected');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
        historyList.dataset.selectedIndex = selectedIndex;
    });

    function updateHistoryList() {
        const mapHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        historyList.innerHTML = '';

        if (mapHistory.length === 0) {
            const item = document.createElement('div');
            item.textContent = 'История пуста';
            item.style.padding = '8px';
            item.style.color = '#888';
            item.style.fontStyle = 'italic';
            item.style.textAlign = 'center';
            item.style.verticalAlign = 'middle';
            historyList.appendChild(item);
            historyList.dataset.selectedIndex = -1;
            return;
        }

        mapHistory.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.id = entry.id;
            item.innerHTML = `
                <span class="history-item-text">${entry.name}</span>
                <span class="history-item-date">(${entry.timestamp})</span>
                <button class="delete-history-item" data-id="${entry.id}">✖</button>
            `;
            item.style.cursor = 'pointer';
            item.style.transition = 'background-color 0.2s';
            historyList.appendChild(item);
        });
    }

    function loadHistoryItem(id) {
        const mapHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const entry = mapHistory.find(e => e.id === id);
        if (entry) {
            pushState();
            loadPointsIntoUI(entry.points, entry.name);
            historyModal.classList.remove('show');
            document.getElementById('historyModalBackdrop').classList.remove('show');
            setTimeout(() => {
                historyModal.style.display = 'none';
                document.getElementById('historyModalBackdrop').style.display = 'none';
                historyList.innerHTML = '';
                historyList.dataset.selectedIndex = -1;
                console.log('History Modal closed after loading item');
            }, 300);
        }
    }
    (() => {
        const highlightClass = 'global-drop-hover';

        function setHighlight(on) {
            document.body.classList.toggle(highlightClass, on);
        }

        function handleDroppedFile(file) {
            const ext = file.name.split('.').pop()?.toLowerCase();

            if (ext === 'kml') {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const kmlText = e.target.result;
                        const parser = new DOMParser();
                        const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
                        const hasLineString = !!kmlDoc.querySelector('LineString');

                        if (hasLineString) {
                            window.pendingKmlData = { kmlText, kmlDoc };
                            const modal = document.getElementById('lineChoiceModal');
                            const back = document.getElementById('lineChoiceModalBackdrop');
                            modal.style.display = back.style.display = 'block';
                            setTimeout(() => {
                                modal.classList.add('show');
                                back.classList.add('show');
                            }, 0);
                        } else {
                            handleKmlWithoutLines(kmlText);
                        }
                    } catch (err) {
                        alert('Ошибка разбора KML: ' + err.message);
                    }
                };
                reader.readAsText(file);
                return;
            }

            if (ext === 'xlsx') {
                const reader = new FileReader();
                reader.onload = evt => {
                    try {
                        const data = new Uint8Array(evt.target.result);
                        const wb = XLSX.read(data, { type: 'array' });
                        const sh = wb.Sheets[wb.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: false });
                        if (rows.length < 2) throw new Error('Таблица пуста или содержит только заголовок');

                        const hdr = rows[0].map(c => String(c || '').toLowerCase());
                        const nameIdx = hdr.findIndex(c => c.includes('название') || c.includes('name'));
                        const latIdx = hdr.findIndex(c => c.includes('lat'));
                        const lonIdx = hdr.findIndex(c => c.includes('lon') || c.includes('long'));

                        if (nameIdx === -1 || latIdx === -1 || lonIdx === -1)
                            throw new Error('Не найдены столбцы: Название, lat, lon');

                        const loadedWells = [];
                        for (let i = 1; i < rows.length; i++) {
                            const r = rows[i];
                            const w = {
                                name: (r[nameIdx] || '').toString().trim(),
                                lat: parseFloat(r[latIdx]),
                                lon: parseFloat(r[lonIdx])
                            };
                            if (w.name && !isNaN(w.lat) && !isNaN(w.lon)) loadedWells.push(w);
                        }

                        // 1. сохраняем в sessionStorage
                        saveWellsToSessionStorage(loadedWells);

                        // 2. сразу обновляем оперативную переменную
                        wells = loadedWells;

                        // 3. обновляем UI, если окно быстрого добавления открыто
                        if (document.getElementById('quickAddModal').classList.contains('show')) {
                            updateQuickAddWellList();
                        }

                        showNotification(`Загружено колодцев: ${wells.length}`);
                    } catch (err) {
                        alert('Ошибка обработки XLSX: ' + err.message);
                    }
                };
                reader.readAsArrayBuffer(file);
                return;
            }

            alert('Поддерживаются только .kml и .xlsx файлы');
        }

        // Включаем подсветку при любом dragover
        let dragCounter = 0; // Счетчик для надежности

        document.addEventListener('dragenter', e => {
            e.preventDefault();
            dragCounter++;
            if (dragCounter === 1) setHighlight(true);
        });

        document.addEventListener('dragleave', e => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) setHighlight(false);
        });

        document.addEventListener('dragover', e => {
            e.preventDefault();
            setHighlight(true); // Дополнительная гарантия
        });

        document.addEventListener('drop', e => {
            e.preventDefault();
            setHighlight(false);
            dragCounter = 0; // Сброс
            const files = e.dataTransfer.files;
            if (files?.length) handleDroppedFile(files[0]);
        });

        document.addEventListener('dragexit', e => { // Дополнительно для краев окна
            setHighlight(false);
            dragCounter = 0;
        });

        // Не используем dragleave — он ненадёжен!
    })();



    function showNotification(message, duration = 3000) {
        // Удаляем предыдущее уведомление
        const oldNotification = document.querySelector('.notification');
        if (oldNotification) {
            oldNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'notification show';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Анимация исчезновения
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, duration);
    }



    window.addEventListener('message', e => {
        if (e.origin !== 'https://seellaro.github.io') return;   // безопасность
        if (e.data?.type !== 'ARGUS_WELL') return;

        const { name, lat, lon } = e.data.well;
        if (!name || !lat || !lon) return;

        pushState();                                  // чтобы Ctrl-Z работал
        const row = addPointRow(name, `${lat.toFixed(6)}/${lon.toFixed(6)}`);
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        setActiveRow(row, true);                      // подсветить и показать на карте
    });

    window.kmlGenerator = {
        map: map,
        baseLayer: baseLayer,
        pointLayer: pointLayer,
        lineLayer: lineLayer,
        buildingLayer: buildingLayer,
        getPointStyle: getPointStyle,
        getLineStyle: getLineStyle,
        getBuildingStyle: getBuildingStyle,
        mapElement: mapElement,
        loadPointsIntoUI: loadPointsIntoUI
    };
});
