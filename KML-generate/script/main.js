document.addEventListener('DOMContentLoaded', function () {
    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    let pointIdCounter = 0;

    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const THEME_KEY = 'theme';

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
        saveDataToLocalStorage();
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

        kmlContent += `
    </Document>
</kml>`;

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
            addPointRow(point.name, `${point.lat.toFixed(6)}/${point.lon.toFixed(6)}`);
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
            console.log('Invalid file type for KML drop'); // Debug log
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const kmlText = event.target.result;
                console.log('KML file read, parsing...'); // Debug log
                const parsed = opener.parseKML(kmlText);
                if (parsed === null) {
                    console.log('Start Point Modal bypassed; points loaded directly'); // Debug log
                    loadPointsIntoUI(opener.points, opener.mapName);
                    opener.points = [];
                    opener.lineCoords = [];
                    opener.mapName = '';
                    return;
                }
                if (!parsed || !parsed.points || parsed.points.length === 0) {
                    alert('В KML файле не найдены точки.');
                    console.log('No points found in KML'); // Debug log
                    return;
                }
                opener.points = parsed.points;
                opener.lineCoords = parsed.lineCoords;
                opener.mapName = parsed.mapName;
                console.log('Triggering Start Point Modal with points:', parsed.points); // Debug log
                opener.showStartPointModal(parsed.mapName || 'Imported Map', parsed.points);
            } catch (error) {
                console.error('Ошибка при разборе KML:', error); // Debug log
                alert('Ошибка при обработке KML файла: ' + error.message);
            }
        };
        reader.onerror = function () {
            alert('Ошибка при чтении KML файла.');
            console.log('Error reading KML file'); // Debug log
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
        }, 0); // Ensure DOM update before animation
        wellsDropZone.style.display = 'block';
        loadingAnimation.style.display = 'none';
        console.log('Wells Modal opened'); // Debug log
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
            console.log('Wells Modal closed'); // Debug log
        }, 300); // Match CSS transition duration
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
                                    console.log('Wells Modal closed after processing'); // Debug log
                                }, 300); // Match CSS transition duration
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
                    console.error('Error processing XLSX:', error); // Debug log
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert('Пожалуйста, загрузите файл XLSX.');
            wellsDropZone.style.display = 'block';
            loadingAnimation.style.display = 'none';
            progressFill.style.width = '0%';
            progressText.textContent = 'Обработка: 0%';
            console.log('Invalid file type for wellsDropZone'); // Debug log
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
        }, 0); // Ensure DOM update before animation
        quickAddSearch.focus();
        updateQuickAddWellList();
        console.log('Quick Add Modal opened'); // Debug log
    });

    quickAddClose.addEventListener('click', function (event) {
        event.stopPropagation();
        quickAddModal.classList.remove('show');
        setTimeout(() => {
            quickAddModal.style.display = 'none';
            quickAddWellList.innerHTML = '';
            quickAddSearch.value = '';
            console.log('Quick Add Modal closed'); // Debug log
        }, 300); // Match CSS transition duration
    });

    quickAddSearch.addEventListener('input', function () {
        updateQuickAddWellList();
    });

    quickAddSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const firstItem = document.querySelector('#quickAddWellList .well-item');
            if (firstItem) {
                selectQuickAddSuggestion(firstItem);
            }
        }
    });

    function updateQuickAddWellList() {
        const value = quickAddSearch.value.trim().toLowerCase();
        quickAddWellList.innerHTML = '';

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
            .slice(0, 50);

        if (filtered.length === 0) {
            const item = document.createElement('div');
            item.textContent = 'Нет совпадений';
            item.style.padding = '8px';
            item.style.color = '#888';
            item.style.fontStyle = 'italic';
            item.style.textAlign = 'center';
            quickAddWellList.appendChild(item);
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
            item.addEventListener('click', function () {
                selectQuickAddSuggestion(item);
            });
            quickAddWellList.appendChild(item);
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
            updateQuickAddWellList();
        }
    }

    function makeModalDraggable(modalId, positionKey) {
        // Only apply dragging to quickAddModal
        if (modalId !== 'quickAddModal') return;

        const modal = document.getElementById(modalId);
        const content = modal.querySelector('.modal-content');
        const header = modal.querySelector('.modal-header');
        const closeButton = modal.querySelector('.close-modal');

        let isDragging = false;
        let offsetX, offsetY;
        let currentX = 0;
        let currentY = 0;

        // Apply faster transition for dragging
       

        // Validate saved position
        const saved = localStorage.getItem(positionKey);
        let isValidPosition = false;
        if (saved) {
            try {
                const { x, y } = JSON.parse(saved);
                // Check if position is within screen bounds
                const maxX = window.innerWidth - (content.offsetWidth || 400); // Assume 400px if not yet rendered
                const maxY = window.innerHeight - (content.offsetHeight || 300); // Assume 300px if not yet rendered
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
            // Center the modal if no valid position
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
    // Dragging disabled for wellsModal and startPointModal
    // makeModalDraggable('wellsModal', 'wellsModalPosition');
    // makeModalDraggable('startPointModal', 'startPointModalPosition');

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
            opener.points = [];
            opener.lineCoords = [];
            opener.mapName = '';
            console.log('Start Point Modal closed'); // Debug log
        }, 300); // Match CSS transition duration
    });

    startPointList.addEventListener('click', function (e) {
        const item = e.target.closest('.well-item');
        if (item) {
            console.log('Start Point Modal button clicked:', item.textContent); // Debug log
            const startName = item.textContent;
            startPointModal.classList.remove('show');
            document.getElementById('startPointModalBackdrop').classList.remove('show');
            setTimeout(() => {
                startPointModal.style.display = 'none';
                document.getElementById('startPointModalBackdrop').style.display = 'none';
                startPointList.innerHTML = '';
                console.log('Start Point Modal closed after selection'); // Debug log
                if (!opener.points || !Array.isArray(opener.points)) {
                    alert('Ошибка: точки не загружены.');
                    return;
                }
                const sortedPoints = opener.sortPoints(startName, opener.points, opener.lineCoords || []);
                loadPointsIntoUI(sortedPoints, opener.mapName);
                opener.points = [];
                opener.lineCoords = [];
                opener.mapName = '';
            }, 300); // Match CSS transition duration
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
        mapElement: mapElement,
        loadPointsIntoUI: loadPointsIntoUI
    };
});
