// main.js
document.addEventListener('DOMContentLoaded', function () {
    const pointsContainer = document.getElementById('pointsContainer');
    const mapNameInput = document.getElementById('mapName');
    const mapElement = document.getElementById('map');
    let pointCount = 1;
    let pointIdCounter = 0;

    const MAP_NAME_KEY = 'kml_generator_map_name';
    const POINTS_KEY = 'kml_generator_points';
    const WELLS_KEY = 'wells_data';

    let vectorSource = new ol.source.Vector({ features: [] });
    let lineSource = new ol.source.Vector({ features: [] });
    let wells = JSON.parse(localStorage.getItem(WELLS_KEY)) || [];

    function getPointStyle(feature) {
        const isDark = document.body.classList.contains('dark-theme');
        const isActive = feature.get('active');
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: isActive ? 'green' : (isDark ? '#4682B4' : 'blue') }),
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

    function getLineStyle() {
        const isDark = document.body.classList.contains('dark-theme');
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: isDark ? '#8B0000' : 'red',
                width: 2
            })
        });
    }

    const pointLayer = new ol.layer.Vector({
        source: vectorSource,
        style: getPointStyle
    });

    const lineLayer = new ol.layer.Vector({
        source: lineSource,
        style: getLineStyle
    });

    const initialZoom = 10;
    const initialView = new ol.View({
        center: ol.proj.fromLonLat([37.6173, 55.7558]),
        zoom: initialZoom
    });

    const baseLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' : 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            attributions: '© CartoDB'
        })
    });

    const map = new ol.Map({
        target: 'map',
        layers: [baseLayer, pointLayer, lineLayer],
        view: initialView
    });

    const translate = new ol.interaction.Translate({
        layers: [pointLayer]
    });
    map.addInteraction(translate);

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
                    updateMap();
                    saveDataToLocalStorage();
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
                row.remove();
                vectorSource.removeFeature(feature);
                updateMap();
                saveDataToLocalStorage();
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

    function addPointRow() {
        pointCount++;
        const pointId = pointIdCounter++;
        const newPointRow = document.createElement('div');
        newPointRow.classList.add('point-row');
        newPointRow.dataset.pointId = pointId;
        newPointRow.innerHTML = `
            <input type="text" class="pointName" placeholder="Название точки ${pointCount}">
            <input type="text" class="pointCoords" placeholder="55.7558/37.6173">
            <button class="move-button" data-direction="up">▲</button>
            <button class="move-button" data-direction="down">▼</button>
            <button class="removePointButton">✖</button>
        `;

        newPointRow.querySelector('.removePointButton').addEventListener('click', function () {
            newPointRow.remove();
            updateMap();
            saveDataToLocalStorage();
        });
        newPointRow.querySelector('.move-button[data-direction="up"]').addEventListener('click', movePointUp);
        newPointRow.querySelector('.move-button[data-direction="down"]').addEventListener('click', movePointDown);

        const nameInput = newPointRow.querySelector('.pointName');
        const coordsInput = newPointRow.querySelector('.pointCoords');
        nameInput.addEventListener('input', function (e) {
            debounce(() => handleNameInput(e), 300);
        });
        nameInput.addEventListener('keydown', handleKeydown);
        nameInput.addEventListener('blur', hideSuggestions);
        coordsInput.addEventListener('input', function () {
            debounce(() => {
                updateMap();
                saveDataToLocalStorage();
            }, 500);
        });

        pointsContainer.appendChild(newPointRow);
        pointsContainer.scrollTo({ top: pointsContainer.scrollHeight, behavior: 'smooth' });
    }

    function handleNameInput(e) {
        const input = e.target;
        const value = input.value.toLowerCase();
        const filteredWells = wells.filter(w => w.name.toLowerCase().includes(value)).slice(0, 10);

        let dropdown = input.parentNode.querySelector('.suggestions');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.classList.add('suggestions');
            input.parentNode.appendChild(dropdown);
        }

        dropdown.innerHTML = '';
        if (filteredWells.length > 0 && value) {
            filteredWells.forEach((well, index) => {
                const item = document.createElement('div');
                item.textContent = well.name;
                item.dataset.index = index;
                item.addEventListener('mousedown', (evt) => { // Use mousedown to prevent blur hiding before click
                    evt.preventDefault();
                    selectSuggestion(input, well);
                });
                dropdown.appendChild(item);
            });
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
        input.dataset.selectedIndex = -1;
    }

    function handleKeydown(e) {
        const input = e.target;
        const dropdown = input.parentNode.querySelector('.suggestions');
        if (!dropdown || dropdown.style.display === 'none') return;

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
        const dropdown = e.target.parentNode.querySelector('.suggestions');
        if (dropdown) {
            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 100);
        }
    }

    function selectSuggestion(input, well) {
        input.value = well.name;
        const coordsInput = input.parentNode.querySelector('.pointCoords');
        coordsInput.value = `${well.lat.toFixed(6)}/${well.lon.toFixed(6)}`;
        updateMap();
        saveDataToLocalStorage();
        const dropdown = input.parentNode.querySelector('.suggestions');
        if (dropdown) dropdown.style.display = 'none';
        const row = input.closest('.point-row');
        setActiveRow(row, true);
        const features = vectorSource.getFeatures();
        if (features.length === 1) {
            // For first point, center without zooming in too much (keep initial zoom)
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

    pointsContainer.addEventListener('click', function (event) {
        if (event.target.classList.contains('removePointButton')) {
            event.target.parentNode.remove();
            updateMap();
            saveDataToLocalStorage();
        }
    });

    function movePointUp(event) {
        const row = event.target.closest('.point-row');
        if (!row) return;

        const prevRow = row.previousElementSibling;
        if (!prevRow) return;

        pointsContainer.insertBefore(row, prevRow);
        updateMap();
        saveDataToLocalStorage();
    }

    function movePointDown(event) {
        const row = event.target.closest('.point-row');
        if (!row) return;

        const nextRow = row.nextElementSibling;
        if (!nextRow) return;
        pointsContainer.insertBefore(nextRow, row);
        updateMap();
        saveDataToLocalStorage();
    }

    document.getElementById('addPointButton').addEventListener('click', function () {
        addPointRow();
        updateMap();
        saveDataToLocalStorage();
    });

    document.getElementById('clearButton').addEventListener('click', function () {
        document.getElementById('mapName').value = '';
        pointsContainer.innerHTML = `
            <div class="point-row">
                <input type="text" class="pointName" placeholder="Название точки 1">
                <input type="text" class="pointCoords" placeholder="55.7558/37.6173">
                <button class="move-button" data-direction="up">▲</button>
                <button class="move-button" data-direction="down">▼</button>
                <button class="removePointButton">✖</button>
            </div>
        `;
        pointCount = 1;
        pointIdCounter = 0;
        const initialRow = pointsContainer.querySelector('.point-row');
        initialRow.dataset.pointId = pointIdCounter++;
        initialRow.querySelector('.move-button[data-direction="up"]').addEventListener('click', movePointUp);
        initialRow.querySelector('.move-button[data-direction="down"]').addEventListener('click', movePointDown);
        const nameInput = initialRow.querySelector('.pointName');
        const coordsInput = initialRow.querySelector('.pointCoords');
        nameInput.addEventListener('input', function (e) {
            debounce(() => handleNameInput(e), 300);
        });
        nameInput.addEventListener('keydown', handleKeydown);
        nameInput.addEventListener('blur', hideSuggestions);
        coordsInput.addEventListener('input', function () {
            debounce(() => {
                updateMap();
                saveDataToLocalStorage();
            }, 500);
        });
        updateMap();
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
            const name = row.querySelector('.pointName').value;
            const coords = row.querySelector('.pointCoords').value;

            if (!name || !coords) {
                alert("Пожалуйста, введите все названия и координаты");
                return null;
            }

            const [latitude, longitude] = coords.split('/').map(parseFloat);

            if (isNaN(latitude) || isNaN(longitude)) {
                alert('Неверный формат координат. Используйте формат широта/долгота (например, 55.7558/37.6173).');
                return null;
            }

            return {
                name: name,
                latitude: latitude,
                longitude: longitude
            };
        }).filter(p => p !== null);

        if (points.length !== pointRows.length) return;

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
                maxZoom: 15  // Limit max zoom during fit to prevent too close zoom
            });
        }
    }

    function saveDataToLocalStorage() {
        const mapName = mapNameInput.value;
        localStorage.setItem(MAP_NAME_KEY, mapName);

        const points = [];
        const pointRows = document.querySelectorAll('.point-row');

        pointRows.forEach(row => {
            const name = row.querySelector('.pointName').value;
            const coords = row.querySelector('.pointCoords').value;
            points.push({ name, coords });
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

            points.forEach((point, i) => {
                addPointRow();
                const row = pointsContainer.children[i];
                row.querySelector('.pointName').value = point.name || '';
                row.querySelector('.pointCoords').value = point.coords || '';
            });
            pointCount = points.length;
            updateMap();
            fitToPoints();
        } else {
            const initialRow = pointsContainer.querySelector('.point-row');
            if (initialRow) {
                initialRow.dataset.pointId = pointIdCounter++;
                const nameInput = initialRow.querySelector('.pointName');
                const coordsInput = initialRow.querySelector('.pointCoords');
                nameInput.addEventListener('input', function (e) {
                    debounce(() => handleNameInput(e), 300);
                });
                nameInput.addEventListener('keydown', handleKeydown);
                nameInput.addEventListener('blur', hideSuggestions);
                coordsInput.addEventListener('input', function () {
                    debounce(() => {
                        updateMap();
                        saveDataToLocalStorage();
                    }, 500);
                });
            }
        }
    }

    loadDataFromLocalStorage();

    mapNameInput.addEventListener('input', function () {
        saveDataToLocalStorage();
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
        pointCount = 0;
        pointIdCounter = 0;

        placemarks.forEach(placemark => {
            const name = placemark.querySelector('name')?.textContent || '';
            const coordinates = placemark.querySelector('Point > coordinates')?.textContent || '';
            const [longitude, latitude] = coordinates.split(',').map(parseFloat);

            if (!isNaN(latitude) && !isNaN(longitude)) {
                addPointRow();
                const newPointRow = pointsContainer.lastElementChild;
                newPointRow.querySelector('.pointName').value = name.replace(/ - \d+ м$/, '');
                newPointRow.querySelector('.pointCoords').value = `${latitude}/${longitude}`;
            }
        });

        updateMap();
        fitToPoints();
        saveDataToLocalStorage();
    }

    const initialRow = pointsContainer.querySelector('.point-row');
    if (initialRow) {
        initialRow.dataset.pointId = pointIdCounter++;
        const nameInput = initialRow.querySelector('.pointName');
        const coordsInput = initialRow.querySelector('.pointCoords');
        nameInput.addEventListener('input', function (e) {
            debounce(() => handleNameInput(e), 300);
        });
        nameInput.addEventListener('keydown', handleKeydown);
        nameInput.addEventListener('blur', hideSuggestions);
        coordsInput.addEventListener('input', function () {
            debounce(() => {
                updateMap();
                saveDataToLocalStorage();
            }, 500);
        });
        initialRow.querySelector('.move-button[data-direction="up"]').addEventListener('click', movePointUp);
        initialRow.querySelector('.move-button[data-direction="down"]').addEventListener('click', movePointDown);
    }

    // Wells upload functionality
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
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

                wells = rows.map(row => ({
                    name: row[0] ? row[0].toString() : '',
                    lat: parseFloat(row[1]),
                    lon: parseFloat(row[2])
                })).filter(w => w.name && !isNaN(w.lon) && !isNaN(w.lat));

               

                setTimeout(() => {
                    hideWellsUpload();
                }, 1000); // Simulate loading time
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert('Пожалуйста, загрузите файл XLSX.');
            loadingAnimation.style.display = 'none';
            wellsDropZone.style.display = 'block';
        }
    });

    // Expose necessary objects for theme.js
    window.kmlGenerator = {
        map: map,
        baseLayer: baseLayer,
        pointLayer: pointLayer,
        lineLayer: lineLayer,
        getPointStyle: getPointStyle,
        getLineStyle: getLineStyle,
        mapElement: mapElement
    };
});