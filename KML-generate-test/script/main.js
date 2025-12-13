document.addEventListener('DOMContentLoaded', async function () {
    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    let pointIdCounter = 0;
    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const THEME_KEY = 'theme';
    const HISTORY_KEY = 'kml_generator_history';
    let history = [];
    let currentHistoryMode = localStorage.getItem('history_mode') || 'lich';
    window.kmlLineSource = null; // Will be YMapFeatureDataSource
    let kmlWithLinesMode = false;
    let digitInputBuffer = '';
    let digitInputTimeout = null;
    let lastExplicitIndex = null;
    let map;
    let schemeLayer;
    let featuresLayer;
    let vectorSource;
    let lineSource;
    let buildingSource;
    let kmlLineLayer; // Will be features added to source
    let pointFeatures = []; // Array of YMapMarker
    let lineFeature = null; // YMapFeature for red line
    let kmlLineFeatures = []; // Array of YMapFeature for blue lines
    let buildingMarkers = []; // Array of YMapMarker for buildings
    let mapListener;
    let wells = [];
    const initialZoom = 10;
    const initialCenter = [37.6173, 55.58]; // [lon, lat]
    const storedTheme = localStorage.getItem(THEME_KEY);
    const isDark = storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    await ymaps3.ready;
    const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker, YMapFeature, YMapListener, YMapFeatureDataSource } = ymaps3;
    schemeLayer = new YMapDefaultSchemeLayer({ theme: isDark ? 'dark' : 'light' });
    featuresLayer = new YMapDefaultFeaturesLayer({});
    vectorSource = new YMapFeatureDataSource({ id: 'vectorSource' });
    lineSource = new YMapFeatureDataSource({ id: 'lineSource' });
    buildingSource = new YMapFeatureDataSource({ id: 'buildingSource' });
    window.kmlLineSource = new YMapFeatureDataSource({ id: 'kmlLineSource' });
    map = new YMap(mapElement, { location: { center: initialCenter, zoom: initialZoom } });
    map.addChild(schemeLayer);
    map.addChild(featuresLayer);
    map.addChild(vectorSource);
    map.addChild(lineSource);
    map.addChild(buildingSource);
    map.addChild(window.kmlLineSource);
    function getLineStyle() {
        const isDark = document.body.classList.contains('dark-theme');
        return { stroke: [{ color: isDark ? 'rgba(81, 31, 31, 1)' : 'rgba(208, 85, 85, 1)', width: 4 }] };
    }
    function getPointStyle(feature) {
        const isDark = document.body.classList.contains('dark-theme');
        const isActive = feature.active;
        const color = isActive ? 'green' : (isDark ? '#325572ff' : '#60a0d4ff');
        const strokeColor = isDark ? '#1C2526' : 'white';
        return { backgroundColor: color, border: `2px solid ${strokeColor}`, borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#D3D3D3' : 'black' };
    }
    function getBuildingStyle(feature) {
        const isDark = document.body.classList.contains('dark-theme');
        return { color: isDark ? '#828282ff' : '#595959ff', fontSize: '12px' };
    }
    function updateMapTheme() {
        schemeLayer.update({ theme: isDark ? 'dark' : 'light' });
    }
    mapListener = new YMapListener({
        layer: 'any',
        onClick: handleMapClick,
        onDblClick: handleMapDblClick,
        onPointerMove: handlePointerMove
    });
    map.addChild(mapListener);
    const toggleKmlLinesControl = document.createElement('button');
    toggleKmlLinesControl.innerHTML = '🗺️';
    toggleKmlLinesControl.title = 'Переключить синие линии KML';
    toggleKmlLinesControl.style.position = 'absolute';
    toggleKmlLinesControl.style.top = '10px';
    toggleKmlLinesControl.style.right = '10px';
    toggleKmlLinesControl.style.backgroundColor = 'transparent';
    toggleKmlLinesControl.addEventListener('click', () => {
        const visible = kmlLineFeatures[0]?.visible ?? true;
        kmlLineFeatures.forEach(f => f.visible = !visible);
        featuresLayer.update();
        toggleKmlLinesControl.style.backgroundColor = !visible ? '#00d3f8' : 'transparent';
    });
    mapElement.appendChild(toggleKmlLinesControl);
    function loadBuildings(extent) {
        buildingMarkers.forEach(m => map.removeChild(m));
        buildingMarkers = [];
        const [minLon, minLat, maxLon, maxLat] = extent; // Assume [minLon, minLat, maxLon, maxLat]
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
                data.elements.forEach(element => {
                    if (element.tags && element.tags['addr:housenumber']) {
                        const div = document.createElement('div');
                        div.textContent = element.tags['addr:housenumber'];
                        Object.assign(div.style, getBuildingStyle({}));
                        const marker = new YMapMarker({ coordinates: [element.center.lon, element.center.lat], draggable: false }, div);
                        map.addChild(marker);
                        buildingMarkers.push(marker);
                    }
                });
            })
            .catch(error => console.error('Ошибка загрузки данных о зданиях:', error));
    }
    map.events.add('boundschange', () => {
        const zoom = map.location.zoom;
        if (zoom >= 16) {
            const bounds = map.location.bounds;
            loadBuildings([bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]);
        } else {
            buildingMarkers.forEach(m => map.removeChild(m));
            buildingMarkers = [];
        }
    });
    function handlePointerMove(ev) {
        const feature = map.features.atCoordinate(ev.coordinates.absolute, { layer: featuresLayer });
        mapElement.style.cursor = feature && feature.geometry.type === 'Point' ? 'pointer' : 'default';
    }
    function handleMapClick(layer, coordinates, object) {
        if (object && object.type === 'feature') {
            const feature = object.entity;
            if (feature.geometry.type === 'Point') {
                const pointId = feature.properties.pointId;
                const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
                if (row) {
                    pointFeatures.forEach(f => f.active = false);
                    feature.active = true;
                    updateMap();
                    setActiveRow(row, false);
                }
            }
        } else {
            const activeRow = document.querySelector('.point-row.active');
            if (activeRow) {
                const coordsInput = activeRow.querySelector('.pointCoords');
                const currentCoords = coordsInput.value;
                if (!currentCoords || !currentCoords.includes('/')) {
                    const [lon, lat] = coordinates.absolute;
                    coordsInput.value = `${lat.toFixed(6)}/${lon.toFixed(6)}`;
                    pushState();
                    updateMap();
                    saveDataToLocalStorage();
                    ensureEmptyRowAtEnd();
                    updatePointNumbers();
                }
            }
        }
    }
    function handleMapDblClick() {
        const coordinates = arguments[1]; // onDblClick has no params, but we can get from context if needed
        const object = arguments[2];
        if (object && object.type === 'feature') {
            const feature = object.entity;
            if (feature.geometry.type === 'Point') {
                const pointId = feature.properties.pointId;
                const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
                if (row) {
                    pushState();
                    row.remove();
                    const index = pointFeatures.findIndex(f => f.properties.pointId === pointId);
                    if (index > -1) {
                        map.removeChild(pointFeatures[index]);
                        pointFeatures.splice(index, 1);
                    }
                    updateMap();
                    saveDataToLocalStorage();
                    ensureEmptyRowAtEnd();
                    updatePointNumbers();
                }
            }
        } else {
            // Zoom in
            map.update({ location: { zoom: map.location.zoom + 1, center: coordinates.absolute, duration: 250 } });
        }
    }
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
        pointFeatures.forEach(f => f.active = f.properties.pointId === parseInt(row.dataset.pointId));
        updateMap();
        if (centerMap) {
            const coords = row.querySelector('.pointCoords').value;
            if (coords && coords.includes('/')) {
                const [latitude, longitude] = coords.split('/').map(parseFloat);
                map.update({ location: { center: [longitude, latitude], duration: 500 } });
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
        newPointRow.draggable = true;
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
        if (isFilled) {
            removeTrailingEmptyRows();
        }
        pointsContainer.appendChild(newPointRow);
        updatePointNumbers();
        newPointRow.addEventListener('dragstart', handleDragStart);
        newPointRow.addEventListener('dragover', handleDragOver);
        newPointRow.addEventListener('dragend', handleDragEnd);
        newPointRow.addEventListener('dragenter', handleDragEnter);
        newPointRow.addEventListener('dragleave', handleDragLeave);
        newPointRow.querySelector('.removePointButton').addEventListener('click', function () {
            const rows = document.querySelectorAll('.point-row');
            const currentName = nameInput.value.trim();
            const currentCoords = coordsInput.value.trim();
            if (rows.length === 1 && currentName === '' && currentCoords === '') {
                return;
            }
            pushState();
            newPointRow.remove();
            const index = pointFeatures.findIndex(f => f.properties.pointId === pointId);
            if (index > -1) {
                map.removeChild(pointFeatures[index]);
                pointFeatures.splice(index, 1);
            }
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
        addPointToMap(pointId, name, coords, newPointRow.classList.contains('active'));
        return newPointRow;
    }
    let draggedRow = null;
    let dragStartY = 0;
    let initialTop = 0;
    function handleDragStart(e) {
        draggedRow = e.target.closest('.point-row');
        draggedRow.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedRow.dataset.pointId);
        const emptyImage = new Image();
        emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImage, 0, 0);
        const rect = draggedRow.getBoundingClientRect();
        dragStartY = e.clientY;
        initialTop = rect.top;
        draggedRow.style.position = 'absolute';
        draggedRow.style.width = `${rect.width}px`;
        draggedRow.style.height = `${rect.height}px`;
        draggedRow.style.top = `${rect.top + pointsContainer.scrollTop - pointsContainer.getBoundingClientRect().top}px`;
        draggedRow.style.zIndex = '1000';
        const placeholder = document.createElement('div');
        placeholder.classList.add('point-row-placeholder');
        placeholder.style.height = `${rect.height}px`;
        placeholder.dataset.pointId = draggedRow.dataset.pointId;
        draggedRow.parentNode.insertBefore(placeholder, draggedRow.nextSibling);
        pointsContainer.addEventListener('wheel', handleWheelDuringDrag);
        updatePointNumbers();
    }
    function handleWheelDuringDrag(e) {
        e.preventDefault();
        const container = pointsContainer;
        const scrollSpeed = 20;
        container.scrollTop += e.deltaY > 0 ? scrollSpeed : -scrollSpeed;
        if (draggedRow) {
            draggedRow.style.top = `${parseFloat(draggedRow.style.top) + (e.deltaY > 0 ? scrollSpeed : -scrollSpeed)}px`;
        }
    }
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!draggedRow) return;
        const deltaY = e.clientY - dragStartY;
        const newTop = initialTop + deltaY;
        draggedRow.style.top = `${newTop + pointsContainer.scrollTop - pointsContainer.getBoundingClientRect().top}px`;
        const rows = Array.from(pointsContainer.querySelectorAll('.point-row:not(.dragging)'));
        const placeholder = pointsContainer.querySelector('.point-row-placeholder');
        let targetRow = null;
        let insertBefore = false;
        for (const row of rows) {
            const rect = row.getBoundingClientRect();
            const rowMid = rect.top + rect.height / 2;
            if (e.clientY < rowMid) {
                targetRow = row;
                insertBefore = true;
                break;
            } else if (e.clientY < rect.bottom) {
                targetRow = row;
                insertBefore = false;
                break;
            }
        }
        if (targetRow) {
            pointsContainer.insertBefore(placeholder, insertBefore ? targetRow : targetRow.nextSibling);
        } else if (e.clientY > rows[rows.length - 1]?.getBoundingClientRect().bottom) {
            pointsContainer.appendChild(placeholder);
        }
        updatePointNumbers();
    }
    function handleDragEnd(e) {
        if (draggedRow) {
            draggedRow.classList.remove('dragging');
            draggedRow.style.position = '';
            draggedRow.style.width = '';
            draggedRow.style.top = '';
            draggedRow.style.zIndex = '';
            const placeholder = pointsContainer.querySelector('.point-row-placeholder');
            if (placeholder) {
                placeholder.parentNode.replaceChild(draggedRow, placeholder);
            }
            draggedRow = null;
            updatePointNumbers();
            updateMap();
            saveDataToLocalStorage();
            pointsContainer.removeEventListener('wheel', handleWheelDuringDrag);
        }
    }
    function handleDragEnter(e) {
        const row = e.target.closest('.point-row:not(.dragging)');
        if (row) {
            row.classList.add('drag-over');
        }
    }
    function handleDragLeave(e) {
        const row = e.target.closest('.point-row:not(.dragging)');
        if (row) {
            row.classList.remove('drag-over');
        }
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
            addPointRow('', '');
            return;
        }
        const lastRow = rows[rows.length - 1];
        const name = lastRow.querySelector('.pointName').value.trim();
        const coords = lastRow.querySelector('.pointCoords').value.trim();
        if (name !== '' || coords !== '') {
            addPointRow('', '');
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
        map.update({ location: { center: [well.lon, well.lat], duration: 500 } });
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
        pointFeatures.forEach(f => map.removeChild(f));
        pointFeatures = [];
        if (lineFeature) map.removeChild(lineFeature);
        lineFeature = null;
        kmlLineFeatures.forEach(f => map.removeChild(f));
        kmlLineFeatures = [];
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
            alert('Нет точек для сортировки.');
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
            alert('Нет данных для сортировки.');
            return;
        }
        const sortedPoints = opener.sortPoints(startName, pointsToSort, null);
        const preserveKmlLines = !!window.preserveKmlLinesDuringSort;
        delete window.preserveKmlLinesDuringSort;
        loadPointsIntoUI(sortedPoints, mapNameToUse);
        kmlWithLinesMode = false;
        kmlLineFeatures.forEach(f => f.visible = preserveKmlLines);
        featuresLayer.update();
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
        history.unshift(entry);
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
    document.getElementById('generateKMLButton').addEventListener('click', function () {
        const mapName = document.getElementById('mapName').value;
        if (!mapName) {
            alert('Пожалуйста, введите название карты.');
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
        saveMapToHistory(mapName, points, kmlContent);
        const kmlData = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
        const kmlURL = URL.createObjectURL(kmlData);
        const sanitizedFileName = mapName
            .replace(/[^\p{L}\p{N}\- ]/gu, '')
            .trim()
            .replace(/\s+/g, '_');
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
        kmlLineFeatures.forEach(f => map.removeChild(f));
        kmlLineFeatures = [];
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
        toggleKmlLinesControl.style.backgroundColor = 'transparent';
        loadPointsIntoUI(opener.points, opener.mapName);
    }
    function handleKmlWithLines(kmlText) {
        const parsed = opener.parseKML(kmlText);
        if (parsed === null) return;
        loadPointsIntoUI(parsed.points, parsed.mapName);
        opener.loadKmlLinesIntoMap(parsed.lineCoordsList);
        document.getElementById('sortPointsButton').style.display = 'inline-block';
        kmlWithLinesMode = true;
        toggleKmlLinesControl.style.backgroundColor = '#00d3f8';
        if (lineFeature) map.removeChild(lineFeature);
        lineFeature = null;
    }
    function addPointToMap(pointId, name, coords, active) {
        if (coords) {
            const [lat, lon] = coords.split('/').map(parseFloat);
            if (!isNaN(lat) && !isNaN(lon)) {
                const div = document.createElement('div');
                Object.assign(div.style, getPointStyle({ active }));
                div.textContent = name;
                const marker = new YMapMarker({ coordinates: [lon, lat], draggable: true }, div);
                marker.properties = { pointId, active, name };
                marker.events.add('dragstart', pushState);
                marker.events.add('dragend', (ev) => {
                    const [newLon, newLat] = ev.coordinates;
                    const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
                    if (row) {
                        const coordsInput = row.querySelector('.pointCoords');
                        coordsInput.value = `${newLat.toFixed(6)}/${newLon.toFixed(6)}`;
                        updateMap();
                        saveDataToLocalStorage();
                        ensureEmptyRowAtEnd();
                        updatePointNumbers();
                        setActiveRow(row, false);
                    }
                });
                map.addChild(marker);
                pointFeatures.push(marker);
            }
        }
    }
    function updateMap() {
        pointFeatures.forEach(f => map.removeChild(f));
        pointFeatures = [];
        if (lineFeature) map.removeChild(lineFeature);
        lineFeature = null;
        const pointRows = document.querySelectorAll('.point-row');
        const coordinates = [];
        let cumulativeDistance = 0;
        let previousCoords = null;
        pointRows.forEach((row, index) => {
            const coords = row.querySelector('.pointCoords').value;
            const name = row.querySelector('.pointName').value;
            const pointId = parseInt(row.dataset.pointId);
            if (coords) {
                const [lat, lon] = coords.split('/').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                    const currentCoords = [lon, lat];
                    let distanceText = '';
                    if (previousCoords) {
                        const from = turf.point(previousCoords);
                        const to = turf.point(currentCoords);
                        const distance = turf.distance(from, to, { units: 'meters' });
                        cumulativeDistance += distance;
                        distanceText = ` - ${Math.round(cumulativeDistance)} м`;
                    }
                    const displayName = name ? `${index + 1}. ${name}` : `${index + 1}.`;
                    addPointToMap(pointId, displayName + distanceText, coords, row.classList.contains('active'));
                    coordinates.push([lon, lat]);
                    previousCoords = currentCoords;
                }
            }
        });
        if (!kmlWithLinesMode && coordinates.length > 1) {
            lineFeature = new YMapFeature({
                geometry: { type: 'LineString', coordinates },
                style: getLineStyle(),
                source: 'lineSource'
            });
            map.addChild(lineFeature);
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
    function fitToPoints() {
        if (pointFeatures.length > 0) {
            const bounds = pointFeatures.reduce((b, f) => {
                const [lon, lat] = f.options.coordinates;
                return [
                    [Math.min(b[0][0], lon), Math.min(b[0][1], lat)],
                    [Math.max(b[1][0], lon), Math.max(b[1][1], lat)]
                ];
            }, [[Infinity, Infinity], [-Infinity, -Infinity]]);
            map.update({ location: { bounds, padding: 50, maxZoom: 15, duration: 500 } });
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
                        targetIndex = window.lastZeroInsertIndex + 1;
                    } else {
                        targetIndex = filledRows.length > 0 ? 1 : 0;
                    }
                    window.lastZeroInsertIndex = targetIndex;
                } else {
                    const num = parseInt(digitInputBuffer, 10);
                    targetIndex = num - 1;
                    window.lastZeroInsertIndex = targetIndex;
                }
                digitInputBuffer = '';
                targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
                const currentIndex = allRows.indexOf(activeRow);
                if (currentIndex === targetIndex) return;
                pushState();
                activeRow.remove();
                if (currentIndex <= targetIndex && targetIndex < maxIndex) {
                    targetIndex++;
                }
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
    }
    loadDataFromLocalStorage();
    mapNameInput.addEventListener('input', function () {
        debounce(saveDataToLocalStorage, 500);
    });
    const dropZone = document.getElementById('drop_zone');
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file || !file.name.toLowerCase().endsWith('.kml')) {
            alert('Пожалуйста, загрузите файл в формате KML.');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const kmlText = event.target.result;
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
                const hasLineString = kmlDoc.querySelector('LineString') !== null;
                if (hasLineString) {
                    const lineChoiceModal = document.getElementById('lineChoiceModal');
                    const backdrop = document.getElementById('lineChoiceModalBackdrop');
                    backdrop.style.display = 'block';
                    lineChoiceModal.style.display = 'block';
                    setTimeout(() => {
                        backdrop.classList.add('show');
                        lineChoiceModal.classList.add('show');
                    }, 0);
                    window.pendingKmlData = { kmlText, kmlDoc };
                } else {
                    handleKmlWithoutLines(kmlText);
                }
            } catch (error) {
                console.error('Ошибка при разборе KML:', error);
                alert('Ошибка при обработке KML файла: ' + error.message);
            }
        };
        reader.onerror = () => alert('Ошибка при чтении KML файла.');
        reader.readAsText(file);
    });
    const loadWellsButton = document.getElementById('loadWellsButton');
    const wellsModal = document.getElementById('wellsModal');
    const wellsDropZone = document.getElementById('wellsDropZone');
    const loadingAnimation = document.getElementById('loadingAnimation');
    const wellsModalClose = document.getElementById('wellsModalClose');
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    loadWellsButton.addEventListener('click', function () {
        wellsModal.style.display = 'block';
        document.getElementById('wellsModalBackdrop').style.display = 'block';
        setTimeout(() => {
            wellsModal.classList.add('show');
            document.getElementById('wellsModalBackdrop').classList.add('show');
        }, 0);
        loadingAnimation.style.display = 'none';
        console.log('Модальное окно загрузки колодцев открыто');
    });
    wellsModalClose.addEventListener('click', function (event) {
        event.stopPropagation();
        wellsModal.classList.remove('show');
        document.getElementById('wellsModalBackdrop').classList.remove('show');
        setTimeout(() => {
            wellsModal.style.display = 'none';
            document.getElementById('wellsModalBackdrop').style.display = 'none';
            wellsDropZone.style.display = 'block';
            loadingAnimation.style.display = 'none';
            progressFill.style.width = '0%';
            progressText.textContent = 'Обработка: 0%';
            console.log('Wells Modal closed');
        }, 300);
    });
    wellsDropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        wellsDropZone.classList.add('dragover');
    });
    wellsDropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        wellsDropZone.classList.remove('dragover');
    });
    wellsDropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        wellsDropZone.classList.remove('dragover');
        wellsDropZone.style.display = 'none';
        loadingAnimation.style.display = 'block';
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.xlsx')) {
            const reader = new FileReader();
            reader.onload = function (event) {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
                    if (rows.length < 1) {
                        throw new Error('Таблица пуста');
                    }
                    const header = rows[0].map(c => (c || '').toString().toLowerCase());
                    const nameIdx = header.findIndex(c => c.includes('название') || c.includes('name'));
                    const latIdx = header.findIndex(c => c.includes('lat') || c.includes('latitude'));
                    const lonIdx = header.findIndex(c => c.includes('lon') || c.includes('long') || c.includes('longitude'));
                    if (nameIdx === -1 || latIdx === -1 || lonIdx === -1) {
                        throw new Error('Не найдены необходимые столбцы: Название, lat, long');
                    }
                    const totalRows = rows.length - 1;
                    let processedRows = 0;
                    wells = [];
                    function processRows(startIndex, batchSize = 100) {
                        const endIndex = Math.min(startIndex + batchSize, totalRows);
                        for (let i = startIndex; i < endIndex; i++) {
                            const row = rows[i + 1];
                            const well = {
                                name: row[nameIdx] ? row[nameIdx].toString() : '',
                                lat: parseFloat(row[latIdx]),
                                lon: parseFloat(row[lonIdx])
                            };
                            if (well.name && !isNaN(well.lat) && !isNaN(well.lon)) {
                                wells.push(well);
                            }
                            processedRows++;
                            const progress = (processedRows / totalRows) * 100;
                            progressFill.style.width = `${progress}%`;
                            progressText.textContent = `Обработка: ${Math.round(progress)}%`;
                        }
                        if (endIndex < totalRows) {
                            setTimeout(() => processRows(endIndex, batchSize), 0);
                        } else {
                            setTimeout(() => {
                                wellsModal.classList.remove('show');
                                document.getElementById('wellsModalBackdrop').classList.remove('show');
                                setTimeout(() => {
                                    wellsModal.style.display = 'none';
                                    document.getElementById('wellsModalBackdrop').style.display = 'none';
                                    wellsDropZone.style.display = 'block';
                                    loadingAnimation.style.display = 'none';
                                    progressFill.style.width = '0%';
                                    progressText.textContent = 'Обработка: 0%';
                                    console.log('Wells Modal closed after processing');
                                }, 300);
                            }, 500);
                        }
                    }
                    processRows(0);
                } catch (error) {
                    alert('Ошибка при чтении таблицы: ' + error.message);
                    wellsDropZone.style.display = 'block';
                    loadingAnimation.style.display = 'none';
                    progressFill.style.width = '0%';
                    progressText.textContent = 'Обработка: 0%';
                    console.error('Error processing XLSX:', error);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert('Пожалуйста, загрузите файл XLSX.');
            wellsDropZone.style.display = 'block';
            loadingAnimation.style.display = 'none';
            progressFill.style.width = '0%';
            progressText.textContent = 'Обработка: 0%';
            console.log('Invalid file type for wellsDropZone');
        }
    });
    const advancedModal = document.getElementById('advancedModal');
    const advancedModalBackdrop = document.getElementById('advancedModalBackdrop');
    const advancedCloseButton = document.getElementById('advancedClose');
    const advancedOptionsList = document.getElementById('advancedOptionsList');
    const kmlGeneratorTitle = document.querySelector('.main h1');
    if (kmlGeneratorTitle) {
        function openAdvancedModal() {
            advancedModal.style.display = 'block';
            advancedModalBackdrop.style.display = 'block';
            setTimeout(() => {
                advancedModal.classList.add('show');
                advancedModalBackdrop.classList.add('show');
            }, 0);
            updateAdvancedOptionsList();
        }
        function closeAdvancedModal() {
            advancedModal.classList.remove('show');
            advancedModalBackdrop.classList.remove('show');
            setTimeout(() => {
                advancedModal.style.display = 'none';
                advancedModalBackdrop.style.display = 'none';
                advancedOptionsList.innerHTML = '';
            }, 300);
        }
        function updateAdvancedOptionsList() {
            advancedOptionsList.innerHTML = '';
            const loadExtensionItem = document.createElement('div');
            loadExtensionItem.className = 'well-item';
            loadExtensionItem.textContent = 'Загрузить расширение';
            loadExtensionItem.addEventListener('click', () => {
                window.open('https://onedrive.rt.ru/personal/uf_kozubov_aleksandr/Documents/%D0%94%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%BD%D0%BE%20%D0%B2%D1%81%D0%B5%D0%BC/KML-generate/extensions/argushelper.zip', '_blank');
                closeAdvancedModal();
            });
            advancedOptionsList.appendChild(loadExtensionItem);
            const clearDataItem = document.createElement('div');
            clearDataItem.className = 'well-item';
            clearDataItem.textContent = 'Очистить данные';
            clearDataItem.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите очистить все данные (localStorage)? Это действие нельзя отменить.')) {
                    try {
                        localStorage.clear();
                        alert('Данные очищены. Страница будет перезагружена.');
                        window.location.reload(true);
                    } catch (e) {
                        console.error('Ошибка при очистке localStorage:', e);
                        alert('Произошла ошибка при очистке данных.');
                    }
                }
                closeAdvancedModal();
            });
            advancedOptionsList.appendChild(clearDataItem);
        }
        kmlGeneratorTitle.addEventListener('dblclick', function (event) {
            event.preventDefault();
            openAdvancedModal();
        });
        advancedCloseButton.addEventListener('click', closeAdvancedModal);
        advancedModalBackdrop.addEventListener('click', function (e) {
            if (e.target === advancedModalBackdrop) {
                closeAdvancedModal();
            }
        });
    }
    if (kmlGeneratorTitle) {
        kmlGeneratorTitle.style.userSelect = 'none';
        kmlGeneratorTitle.style.webkitUserSelect = 'none';
        kmlGeneratorTitle.style.mozUserSelect = 'none';
        kmlGeneratorTitle.style.msUserSelect = 'none';
        kmlGeneratorTitle.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
    }
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
            map.update({ location: { center: [well.lon, well.lat], duration: 500 } });
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
    window.addEventListener('message', e => {
        if (e.origin !== 'https://seellaro.github.io') return;
        if (e.data?.type !== 'ARGUS_WELL') return;
        const {name, lat, lon} = e.data.well;
        if (!name || !lat || !lon) return;
        pushState();
        const row = addPointRow(name, `${lat.toFixed(6)}/${lon.toFixed(6)}`);
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        setActiveRow(row, true);
      });
    window.kmlGenerator = {
        map: map,
        schemeLayer: schemeLayer,
        featuresLayer: featuresLayer,
        getPointStyle: getPointStyle,
        getLineStyle: getLineStyle,
        getBuildingStyle: getBuildingStyle,
        mapElement: mapElement,
        loadPointsIntoUI: loadPointsIntoUI
    };
});