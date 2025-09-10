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
    let wells = [];
    let history = [];

    function getLineStyle() {
        const isDark = document.body.classList.contains('dark-theme');
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: isDark ? '#511f1fff' : '#d05555ff',
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
        layers: [baseLayer, buildingLayer, pointLayer, lineLayer],
        view: initialView
    });

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
                alert('Выберите активную точку для обновления координат.');
            }
        }
    });

    map.on('dblclick', function (evt) {
        evt.preventDefault();
        const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });
        if (feature && feature.getGeometry().getType() === 'Point') {
            const pointId = feature.get('pointId');
            const row = document.querySelector(`.point-row[data-point-id="${pointId}"]`);
            pushState();
            row.remove();
            vectorSource.removeFeature(feature);
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
            
        }
    });

    function setActiveRow(row, centerMap = true) {
        document.querySelectorAll('.point-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');

        const container = pointsContainer;
        const rowRect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollPosition = row.offsetTop - container.offsetTop - (containerRect.height / 2 - rowRect.height / 2);
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
        if (row && !event.target.matches('button') && !event.target.closest('.suggestions')) {
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

        newPointRow.innerHTML = `
            <span class="point-number"></span>
            <input type="text" class="pointName" placeholder="Название точки">
            <input type="text" class="pointCoords" placeholder="55.7558/37.6173">
            <button class="move-button" data-direction="up">▲</button>
            <button class="move-button" data-direction="down">▼</button>
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

        newPointRow.querySelector('.removePointButton').addEventListener('click', function () {
            const rows = document.querySelectorAll('.point-row');
            const currentName = nameInput.value.trim();
            const currentCoords = coordsInput.value.trim();
            if (rows.length === 1 && currentName === '' && currentCoords === '') {
                return;
            }
            pushState();
            newPointRow.remove();
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
            // Refresh Quick Add modal if open
            if (document.getElementById('quickAddModal').classList.contains('show')) {
                updateQuickAddWellList();
            }
        });

        newPointRow.querySelector('.move-button[data-direction="up"]').addEventListener('click', movePointUp);
        newPointRow.querySelector('.move-button[data-direction="down"]').addEventListener('click', movePointDown);

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

    function movePointUp(event) {
        const row = event.target.closest('.point-row');
        if (!row) return;

        const prevRow = row.previousElementSibling;
        if (!prevRow) return;

        pushState();
        pointsContainer.insertBefore(row, prevRow);
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        setActiveRow(row, false);
    }

    function movePointDown(event) {
        const row = event.target.closest('.point-row');
        if (!row) return;

        const nextRow = row.nextElementSibling;
        if (!nextRow) return;

        pushState();
        pointsContainer.insertBefore(nextRow, row);
        updateMap();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
        setActiveRow(row, false);
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
        updateMap();
        saveDataToLocalStorage();
        updatePointNumbers();
        // Refresh Quick Add modal if open
        if (document.getElementById('quickAddModal').classList.contains('show')) {
            updateQuickAddWellList();
        }
    });

    function saveMapToHistory(mapName, points, kmlContent) {
        let mapHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        // Prepend new entry to the history array to make it appear at the top
        mapHistory.unshift({
            id: Date.now(),
            name: mapName,
            timestamp: new Date().toLocaleString('ru-RU'),
            points: points,
            kml: kmlContent
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(mapHistory));
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

        let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>${mapName}</name>
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
            <name>${point.name}${distanceText}</name>
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
            <name>Route</name>
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

        const link = document.createElement('a');
        link.href = kmlURL;
        link.download = `${mapName.replace(/[^a-zA-Z0-9]/g, '_')}.kml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(kmlURL);
    });

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

                    const feature = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([longitude, latitude])),
                        name: name + distanceText,
                        pointId: pointId,
                        active: row.classList.contains('active')
                    });

                    vectorSource.addFeature(feature);
                    coordinates.push(ol.proj.fromLonLat([longitude, latitude]));

                    previousCoords = [longitude, latitude];
                }
            }
        });

        if (coordinates.length > 1) {
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
        // Refresh Quick Add modal if open
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
            // Handle both {lat, lon} and {latitude, longitude} formats
            const lat = point.latitude !== undefined ? point.latitude : point.lat;
            const lon = point.longitude !== undefined ? point.longitude : point.lon;
            // Validate coordinates
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
            console.log('Invalid file type for KML drop');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const kmlText = event.target.result;
                console.log('KML file read, parsing...');
                const parsed = opener.parseKML(kmlText);
                if (parsed === null) {
                    console.log('Start Point Modal bypassed; points loaded directly');
                    loadPointsIntoUI(opener.points, opener.mapName);
                    opener.points = [];
                    opener.lineCoords = [];
                    opener.mapName = '';
                    return;
                }
                if (!parsed || !parsed.points || parsed.points.length === 0) {
                    alert('В KML файле не найдены точки.');
                    console.log('No points found in KML');
                    return;
                }
                opener.points = parsed.points;
                opener.lineCoords = parsed.lineCoords;
                opener.mapName = parsed.mapName;
                console.log('Triggering Start Point Modal with points:', parsed.points);
                opener.showStartPointModal(parsed.mapName || 'Imported Map', parsed.points);
            } catch (error) {
                console.error('Ошибка при разборе KML:', error);
                alert('Ошибка при обработке KML файла: ' + error.message);
            }
        };
        reader.onerror = function () {
            alert('Ошибка при чтении KML файла.');
            console.log('Error reading KML file');
        };
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
        wellsDropZone.style.display = 'block';
        loadingAnimation.style.display = 'none';
        console.log('Wells Modal opened');
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
        // Получаем все элементы списка .well-item
        const items = Array.from(quickAddWellList.querySelectorAll('.well-item'));
        // Получаем текущий выбранный индекс из dataset, с учетом его типа
        let selectedIndex = parseInt(quickAddSearch.dataset.selectedIndex, 10);
        if (isNaN(selectedIndex)) selectedIndex = -1;
    
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Переходим к следующему элементу
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Переходим к предыдущему элементу
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items, selectedIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            // Если ничего не выбрано, выбираем первый
            if (selectedIndex < 0 && items.length > 0) {
                selectedIndex = 0;
                updateSelection(items, selectedIndex);
            }
            // Если выбран элемент
            if (selectedIndex >= 0 && wellsToShow[selectedIndex]) {
                selectQuickAddSuggestion(wellsToShow[selectedIndex]);
                // После выбора сбрасываем состояние
                selectedIndex = 0;
                updateSelection(items, selectedIndex);
                updateQuickAddWellList(); // обновляем список
            }
        }
    
        // Функция для обновления выделения
        function updateSelection(items, index) {
            // Убираем класс у всех элементов
            items.forEach(item => item.classList.remove('selected'));
            if (index >= 0 && index < items.length) {
                // Добавляем класс для выделения
                items[index].classList.add('selected');
                // Скроллим вью к выделенному
                items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            // Обновляем индекс
            quickAddSearch.dataset.selectedIndex = String(index);
        }
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
        startPointModal.classList.remove('show');
        document.getElementById('startPointModalBackdrop').classList.remove('show');
        setTimeout(() => {
            startPointModal.style.display = 'none';
            document.getElementById('startPointModalBackdrop').style.display = 'none';
            startPointList.innerHTML = '';
            startPointList.dataset.selectedIndex = -1;
            console.log('Start Point Modal closed after selection');
            if (!opener.points || !Array.isArray(opener.points)) {
                alert('Ошибка: точки не загружены.');
                return;
            }
            const sortedPoints = opener.sortPoints(startName, opener.points, opener.lineCoords || []);
            loadPointsIntoUI(sortedPoints, opener.mapName);
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
        }, 300);
    }

    // History Modal Functionality
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

        // Iterate over history in order (newest first, as unshift is used in saveMapToHistory)
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

