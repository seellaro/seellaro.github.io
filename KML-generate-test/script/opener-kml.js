// opener-kml.js

let opener = {
    points: [],
    lineCoordsList: [], // массив линий из KML
    mapName: '',

    parseKML(kmlText) {
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
        const placemarks = kmlDoc.getElementsByTagName('Placemark');
        const points = [];
        const lineCoordsList = [];
        let mapName = kmlDoc.getElementsByTagName('name')[0]?.textContent.trim() || 'Imported Map';

        for (let placemark of placemarks) {
            let name = placemark.getElementsByTagName('name')[0]?.textContent || '';
            const distanceRegex = /\s*[- ]?\s*\d+\s*[mMмМ]$/gi;
            name = name.replace(distanceRegex, '').trim();

            const point = placemark.getElementsByTagName('Point')[0];
            const lineString = placemark.getElementsByTagName('LineString')[0];

            if (point) {
                const coords = point.getElementsByTagName('coordinates')[0]?.textContent.trim();
                if (coords) {
                    const [lon, lat] = coords.split(',').map(parseFloat);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        points.push({ name, lat, lon });
                    }
                }
            } else if (lineString) {
                const coords = lineString.getElementsByTagName('coordinates')[0]?.textContent.trim();
                if (coords) {
                    const lineCoords = coords.split(/\s+/).map(coord => {
                        const [lon, lat] = coord.split(',').map(parseFloat);
                        return !isNaN(lat) && !isNaN(lon) ? [lon, lat] : null;
                    }).filter(coord => coord !== null);

                    if (lineCoords.length > 1) {
                        const first = lineCoords[0];
                        const last = lineCoords[lineCoords.length - 1];
                        const isClosed = Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6;
                        if (!isClosed) {
                            lineCoordsList.push(lineCoords);
                        }
                    }
                }
            }
        }

        this.points = points;
        this.lineCoordsList = lineCoordsList;
        this.mapName = mapName;

        return { points, lineCoordsList, mapName };
    },

    // Функция загрузки синих линий на карту (вызывается из main.js)
    loadKmlLinesIntoMap(lineCoordsList) {
        const { featuresLayer } = window.kmlGenerator;

        // Удаляем старые линии
        if (window.kmlLinesCollection) {
            window.kmlLinesCollection.forEach(line => {
                featuresLayer.removeChild(line);
            });
            window.kmlLinesCollection = null;
        }

        if (lineCoordsList.length === 0) return;

        window.kmlLinesCollection = [];

        lineCoordsList.forEach(coords => {
            if (coords.length < 2) return;

            const feature = new ymaps3.YMapFeature({
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                },
                style: {
                    stroke: [{ color: '#00d3f8', width: 4, opacity: 0.6 }],
                    zIndex: 50
                }
            });

            featuresLayer.addChild(feature);
            window.kmlLinesCollection.push(feature);
        });

        window.kmlLinesVisible = true;
    },

    // Показ модалки выбора начальной точки (если нужно сортировать)
    showStartPointModal(points, mapName) {
        const modal = document.getElementById('startPointModal');
        const backdrop = document.getElementById('startPointModalBackdrop');
        const list = document.getElementById('startPointList');
        const subHeader = document.getElementById('mapNameSub');
        const closeBtn = document.getElementById('startPointClose');

        subHeader.textContent = mapName;
        list.innerHTML = '';

        points.forEach(point => {
            const item = document.createElement('div');
            item.textContent = point.name || 'Без названия';
            item.className = 'well-item';
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '6px';
            item.style.transition = 'background-color 0.2s';

            item.addEventListener('click', () => {
                opener.sortAndLoadPoints(point.name);
                modal.classList.remove('show');
                backdrop.classList.remove('show');
                setTimeout(() => {
                    modal.style.display = 'none';
                    backdrop.style.display = 'none';
                }, 300);
            });

            list.appendChild(item);
        });

        modal.style.display = 'block';
        backdrop.style.display = 'block';
        modal.classList.add('show');
        backdrop.classList.add('show');
    },

    // Сортировка точек по ближайшей от стартовой
    sortAndLoadPoints(startName) {
        const points = opener.points;
        const startPoint = points.find(p => p.name === startName);
        if (!startPoint) return;

        const sortedPoints = [startPoint];
        const remaining = points.filter(p => p.name !== startName);
        let current = startPoint;

        while (remaining.length > 0) {
            let nearest = null;
            let minDist = Infinity;

            remaining.forEach(p => {
                const dx = p.lon - current.lon;
                const dy = p.lat - current.lat;
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    nearest = p;
                }
            });

            if (nearest) {
                sortedPoints.push(nearest);
                remaining.splice(remaining.indexOf(nearest), 1);
                current = nearest;
            } else {
                break;
            }
        }

        window.kmlGenerator.loadPointsIntoUI(sortedPoints, opener.mapName);
    }
};
