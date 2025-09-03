/**
 * Main application logic for KML Generator
 * Handles map interactions, point management, KML generation, and modal functionality
 */
document.addEventListener('DOMContentLoaded', function () {
    // Load jQuery
    const script = document.createElement('script');
    script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
    script.integrity = 'sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    let pointIdCounter = 0;

    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const THEME_KEY = 'theme';
    const POSITION_KEY = 'quickAddModalPosition';

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
        center: ol.proj.fromLonLat([37.6173, 55.7558]),
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

    translate.on('translatestart', function (evt) {
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
                coordsInput.value = coord[1].toFixed(6) + '/' + coord[0].toFixed(6);
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
                    coordsInput.value = coordinate[1].toFixed(6) + "/" + coordinate[0].toFixed(6);
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
            if (row && confirm('Удалить эту точку?')) {
                pushState();
                row.remove();
                vectorSource.removeFeature(feature);
                updateMap();
                saveDataToLocalStorage();
                ensureEmptyRowAtEnd();
                updatePointNumbers();
            }
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
            if (coords) {
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

        // Удаление точки
        newPointRow.querySelector('.removePointButton').addEventListener('click', function () {
            const rows = document.querySelectorAll('.point-row');
            const currentName = nameInput.value.trim();
            const currentCoords = coordsInput.value.trim();
            if (rows.length === 1 && currentName === '' && currentCoords === '') {
                return; // Не удаляем последнюю пустую строку
            }
            pushState();
            newPointRow.remove();
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
        });

        // Кнопки перемещения
        newPointRow.querySelector('.move-button[data-direction="up"]').addEventListener('click', movePointUp);
        newPointRow.querySelector('.move-button[data-direction="down"]').addEventListener('click', movePointDown);

        // Ввод названия — с автозаполнением по колодцам
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

        // Ввод координат
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
        let selectedIndex = parseInt(input.dataset.selectedIndex);

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
        const features = vectorSource.getFeatures();
        if (features.length === 1) {
            const coord = ol.proj.fromLonLat([well.lon, well.lat]);
            map.getView().animate({
                center: coord,
                zoom: initialZoom,
                duration: 500
            });
        } else {
            fitToPoints();
        }
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
        updatePointNumbers();
        localStorage.removeItem(MAP_NAME_KEY);
        localStorage.removeItem(POINTS_KEY);
    });

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

        kmlContent += ` </Document> </kml>`;
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
        let totalDistance = 0;
        let previousCoords = null;
        let cumulativeDistance = 0;

        pointRows.forEach((row, index) => {
            const coords = row.querySelector('.pointCoords').value;
            const name = row.querySelector('.pointName').value;
            const pointId = row.dataset.pointId;

            if (coords) {
                const [latitude, longitude] = coords.split('/').map(parseFloat);

                if (!isNaN(latitude) && !isNaN(longitude)) {
                    const currentCoords = [longitude, latitude];

                    let distanceText = '';
                    if (index > 0 && pointRows[index - 1].querySelector('.pointCoords').value) {
                        const prevCoords = pointRows[index - 1].querySelector('.pointCoords').value.split('/').map(parseFloat);
                        const from = turf.point([prevCoords[1], prevCoords[0]]);
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

                    if (previousCoords) {
                        const from = turf.point(previousCoords);
                        const to = turf.point([longitude, latitude]);
                        const options = { units: 'kilometers' };
                        const distance = turf.distance(from, to, options);
                        totalDistance += distance;
                    }
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
        document.getElementById('totalDistance').textContent = `Общее расстояние: ${Math.round(totalDistance)} км`;
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

        let pointIdToHighlight = null;

        const currentPoints = Array.from(document.querySelectorAll('.point-row')).map(row => ({
            pointId: parseInt(row.dataset.pointId),
            name: row.querySelector('.pointName').value,
            coords: row.querySelector('.pointCoords').value
        }));
        const prevState = history.length > 0 ? history[history.length - 1] : { points: [] };
        const prevPoints = prevState.points || [];
        const prevMap = new Map(prevPoints.map(p => [p.pointId, p]));
        const currentMap = new Map(currentPoints.map(p => [p.pointId, p]));

        const restoredPointIds = state.points
            .filter(p => !currentMap.has(p.pointId))
            .map(p => p.pointId);

        const changedIds = [];
        state.points.forEach((c, index) => {
            const prev = prevMap.get(c.pointId);
            const prevIndex = prev ? prevPoints.findIndex(p => p.pointId === c.pointId) : -1;
            if (!prev || prev.name !== c.name || prev.coords !== c.coords || prevIndex !== index) {
                changedIds.push(c.pointId);
            }
        });

        if (restoredPointIds.length > 0) {
            pointIdToHighlight = restoredPointIds[0];
        } else if (changedIds.length > 0) {
            pointIdToHighlight = changedIds.find(id => addedRows.some(r => r.pointId === id));
        }

        if (!pointIdToHighlight && state.activePointId) {
            pointIdToHighlight = state.activePointId;
        }

        if (pointIdToHighlight) {
            const rowEntry = addedRows.find(r => r.pointId === pointIdToHighlight);
            if (rowEntry) {
                setActiveRow(rowEntry.row, false);
            }
        } else if (addedRows.length > 0) {
            setActiveRow(addedRows[0].row, false);
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
            if (name.trim() !== '' || coords.trim() !== '') { // Save only non-empty rows
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
            points.forEach((point) => {
                addPointRow(point.name, point.coords);
            });
            updateMap();
            fitToPoints();
        } 
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
        const reader = new FileReader();

        reader.onload = function (event) {
            const kmlText = event.target.result;
            parseKML(kmlText);
        };

        reader.readAsText(file);
    });

    function parseKML(kmlText) {
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlText, 'text/xml');

        const mapNameElement = kml.querySelector('Document > name');
        if (mapNameElement) {
            mapNameInput.value = mapNameElement.textContent;
        }

        const placemarks = kml.querySelectorAll('Placemark');

        pointsContainer.innerHTML = '';
        pointIdCounter = 0;

        placemarks.forEach(placemark => {
            const name = placemark.querySelector('name')?.textContent || '';
            const coordinates = placemark.querySelector('Point > coordinates')?.textContent || '';
            const [longitude, latitude] = coordinates.split(',').map(parseFloat);

            if (!isNaN(latitude) && !isNaN(longitude)) {
                addPointRow(name.replace(/ - \d+ м$/, ''), `${latitude}/${longitude}`);
            }
        });

        updateMap();
        fitToPoints();
        saveDataToLocalStorage();
        ensureEmptyRowAtEnd();
        updatePointNumbers();
    }

    const loadWellsButton = document.getElementById('loadWellsButton');
    const wellsDropZone = document.getElementById('wellsDropZone');
    const loadingAnimation = document.getElementById('loadingAnimation');
    const backButton = document.getElementById('backButton');
    const fro = document.querySelector('.fro');
    const buttons = document.querySelector('.buttons');

    loadWellsButton.addEventListener('click', showWellsUpload);

    function showWellsUpload() {
        fro.style.display = 'none';
        buttons.style.display = 'none';
        mapElement.style.display = 'none';
        wellsDropZone.style.display = 'block';
        backButton.style.display = 'block';
        loadingAnimation.style.display = 'none';
    }

    function hideWellsUpload() {
        fro.style.display = 'flex';
        buttons.style.display = 'flex';
        mapElement.style.display = 'block';
        wellsDropZone.style.display = 'none';
        backButton.style.display = 'none';
        loadingAnimation.style.display = 'none';
    }

    backButton.addEventListener('click', hideWellsUpload);

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
        if (file && file.name.endsWith('.xlsx')) {
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
                    const nameIdx = header.findIndex(c => c.includes('название'));
                    const latIdx = header.findIndex(c => c.includes('lat'));
                    const lonIdx = header.findIndex(c => c.includes('long'));

                    if (nameIdx === -1 || latIdx === -1 || lonIdx === -1) {
                        throw new Error('Не найдены необходимые столбцы: Название, lat, long');
                    }

                    wells = rows.slice(1).map(row => ({
                        name: row[nameIdx] ? row[nameIdx].toString() : '',
                        lat: parseFloat(row[latIdx]),
                        lon: parseFloat(row[lonIdx])
                    })).filter(w => w.name && !isNaN(w.lat) && !isNaN(w.lon));

                    setTimeout(() => {
                        hideWellsUpload();
                    }, 1000);
                } catch (error) {
                    alert('Ошибка при чтении таблицы: ' + error.message);
                    loadingAnimation.style.display = 'none';
                    wellsDropZone.style.display = 'block';
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert('Пожалуйста, загрузите файл XLSX.');
            loadingAnimation.style.display = 'none';
            wellsDropZone.style.display = 'block';
        }
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
        mapElement: mapElement
    };

    const quickAddModal = document.getElementById('quickAddModal');
    const quickAddSearch = document.getElementById('quickAddSearch');
    const quickAddWellList = document.getElementById('quickAddWellList');
    const quickAddConfirm = document.getElementById('quickAddConfirm');
    const quickAddClose = document.getElementById('quickAddClose');
    const quickAddButton = document.getElementById('quickAddButton');

    let currentSuggestions = [];

    // Открытие окна
    quickAddButton.addEventListener('click', () => {
        quickAddModal.style.display = 'flex';
    
        const content = quickAddModal.querySelector('.modal-content');
    
        // Bound position on open
        const saved = localStorage.getItem(POSITION_KEY);
        let currentX, currentY;
        if (saved) {
            const { x, y } = JSON.parse(saved);
            currentX = x;
            currentY = y;
        } else {
            currentX = ($(window).width() - $(content).outerWidth()) / 2;
            currentY = ($(window).height() - $(content).outerHeight()) / 2;
            localStorage.setItem(POSITION_KEY, JSON.stringify({ x: currentX, y: currentY }));
        }
        $(content).css({ left: currentX, top: currentY });
    
        quickAddSearch.focus();
        updateQuickAddWellList();
    });

    // Закрытие окна
    quickAddClose.addEventListener('click', () => {
        quickAddModal.style.display = 'none';
        const wellList = document.getElementById('quickAddWellList');
        wellList.innerHTML = '';
    });

    // Поиск при вводе
    quickAddSearch.addEventListener('input', () => {
        updateQuickAddWellList();
    });

    quickAddSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const firstItem = document.querySelector('#quickAddWellList .well-item');
            if (firstItem) {
                selectQuickAddSuggestion(firstItem);
            }
        }
    });

    function updateQuickAddWellList() {
        const value = quickAddSearch.value.trim().toLowerCase();
        const wellList = document.getElementById('quickAddWellList');
        wellList.innerHTML = ''; // очищаем список
    
        if (!value) return;
    
        const filtered = wells
            .filter(w => w.name.toLowerCase().includes(value))
            .sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                if (aName === value) return -1;
                if (bName === value) return 1;
                if (aName.startsWith(value) && !bName.startsWith(value)) return -1;
                if (!aName.startsWith(value) && bName.startsWith(value)) return 1;
                return aName.length - bName.length;
            })
            .slice(0, 50); // максимум 50
    
        if (filtered.length === 0) {
            const item = document.createElement('div');
            item.textContent = 'Нет совпадений';
            item.style.padding = '8px';
            item.style.color = '#888';
            item.style.fontStyle = 'italic';
            item.style.textAlign = 'center';
            wellList.appendChild(item);
            return;
        }
    
        filtered.forEach(well => {
            const item = document.createElement('div');
            item.textContent = well.name;
            item.className = 'well-item';
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '6px';
            item.style.transition = 'background-color 0.2s';
            item.addEventListener('click', () => {
                quickAddSearch.value = well.name;
                selectQuickAddSuggestion(item);
            });
            wellList.appendChild(item);
        });
    }

    function selectQuickAddSuggestion(item) {
        const wellName = item.textContent;
        const well = wells.find(w => w.name === wellName);
        if (well) {
            pushState();
    
            const newRow = addPointRow(well.name, `${well.lat.toFixed(6)}/${well.lon.toFixed(6)}`);
            updateMap();
            saveDataToLocalStorage();
            ensureEmptyRowAtEnd();
            updatePointNumbers();
            setActiveRow(newRow, true);
            fitToPoints();
    
            updateQuickAddWellList(); // обновляем список, не очищая поле
        }
    }

    quickAddConfirm.addEventListener('click', () => {
        const firstItem = document.querySelector('#quickAddWellList .well-item');
        if (firstItem) {
            selectQuickAddSuggestion(firstItem);
        } else {
            alert('Нет подходящих колодцев.');
        }
    });

    // Сделать модальное окно перетаскиваемым с использованием jQuery
    function makeModalDraggable() {
        const $modal = $('#quickAddModal');
        const $content = $modal.find('.modal-content');
        const $header = $modal.find('.modal-header');

        $content.css({
            position: 'absolute'
        });

        $header.css('cursor', 'move');

        let savedPosition = localStorage.getItem(POSITION_KEY);
        if (savedPosition) {
            const { x, y } = JSON.parse(savedPosition);
            $content.css({ left: x, top: y });
        }

        $header.on('mousedown', function (e) {
            e.preventDefault();
            let offsetX = e.clientX - parseInt($content.css('left') || 0);
            let offsetY = e.clientY - parseInt($content.css('top') || 0);

            function moveModal(e) {
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;

                // Ограничиваем перемещение в пределах окна
                newX = Math.max(0, Math.min(newX, $(window).width() - $content.outerWidth()));
                newY = Math.max(0, Math.min(newY, $(window).height() - $content.outerHeight()));

                $content.css({
                    left: newX,
                    top: newY
                });
            }

            $(document).on('mousemove.modalDrag', moveModal);

            $(document).one('mouseup', function () {
                $(document).off('mousemove.modalDrag');
                localStorage.setItem(POSITION_KEY, JSON.stringify({
                    x: parseInt($content.css('left')),
                    y: parseInt($content.css('top'))
                }));
            });
        });

        // Обновляем позицию при изменении размера окна
        $(window).on('resize', function () {
            let currentX = parseInt($content.css('left') || 0);
            let currentY = parseInt($content.css('top') || 0);

            currentX = Math.max(0, Math.min(currentX, $(window).width() - $content.outerWidth()));
            currentY = Math.max(0, Math.min(currentY, $(window).height() - $content.outerHeight()));

            $content.css({
                left: currentX,
                top: currentY
            });

            localStorage.setItem(POSITION_KEY, JSON.stringify({
                x: currentX,
                y: currentY
            }));
        });
    }

    // Ждем загрузки jQuery перед вызовом
    script.onload = function () {
        makeModalDraggable();
    };
});
