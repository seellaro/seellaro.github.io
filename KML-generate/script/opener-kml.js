let opener = {
    points: [],
    lineCoordsList: [], // ← массив линий из KML
    mapName: '',

    parseKML(kmlText) {
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
        const placemarks = kmlDoc.getElementsByTagName('Placemark');
        const points = [];
        const lineCoordsList = []; // ← все линии
        let mapName = kmlDoc.getElementsByTagName('name')[0]?.textContent || 'Imported Map';

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
                        // Проверяем, замкнута ли линия (первая и последняя точки совпадают)
                        const first = lineCoords[0];
                        const last = lineCoords[lineCoords.length - 1];
                        const isClosed = first[0] === last[0] && first[1] === last[1];

                        // Игнорируем замкнутые линии (скорее всего — здания или полигоны)
                        if (!isClosed) {
                            lineCoordsList.push(lineCoords);
                        }
                    }
                }
            }
        }

        // Удаляем автоматическую загрузку — возвращаем данные для модального окна
        this.points = points;
        this.lineCoordsList = lineCoordsList;
        this.mapName = mapName;
        return { points, lineCoordsList, mapName };
    },

    sortPoints(startName, points, lineCoords) {
        const startPoint = points.find(p => p.name === startName);
        if (!startPoint) return points;

        const sortedPoints = [startPoint];
        const remainingPoints = points.filter(p => p.name !== startName);
        let currentPoint = startPoint;

        while (remainingPoints.length > 0) {
            let nearestPoint = null;
            let minDistance = Infinity;

            remainingPoints.forEach(point => {
                const from = turf.point([currentPoint.lon, currentPoint.lat]);
                const to = turf.point([point.lon, point.lat]);
                const distance = turf.distance(from, to, { units: 'meters' });
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPoint = point;
                }
            });

            if (nearestPoint) {
                sortedPoints.push(nearestPoint);
                currentPoint = nearestPoint;
                remainingPoints.splice(remainingPoints.indexOf(nearestPoint), 1);
            } else {
                break;
            }
        }

        return sortedPoints;
    },

    showStartPointModal(mapName, points) {
        const modal = document.getElementById('startPointModal');
        const list = document.getElementById('startPointList');
        const subHeader = document.getElementById('mapNameSub');

        subHeader.textContent = mapName;
        list.innerHTML = '';

        points.forEach(point => {
            const item = document.createElement('div');
            item.textContent = point.name;
            item.className = 'well-item';
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '6px';
            item.style.transition = 'background-color 0.2s';
            list.appendChild(item);
        });

        modal.style.display = 'block';
        document.getElementById('startPointModalBackdrop').style.display = 'block';
        modal.classList.add('show');
        document.getElementById('startPointModalBackdrop').classList.add('show');
    },

    loadKmlLinesIntoMap(lineCoordsList) {
        window.kmlLineSource.clear();
        lineCoordsList.forEach(lineCoords => {
            if (lineCoords.length < 2) return;
            const lineFeature = new ol.Feature({
                geometry: new ol.geom.LineString(
                    lineCoords.map(coord => ol.proj.fromLonLat(coord))
                )
            });
            window.kmlLineSource.addFeature(lineFeature);
        });
    }
};
