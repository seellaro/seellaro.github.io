//opener-kml.js
let opener = {
    points: [],
    lineCoords: [],
    mapName: '',

    parseKML(kmlText) {
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
        const placemarks = kmlDoc.getElementsByTagName('Placemark');
        const points = [];
        let lineCoords = [];
        let mapName = kmlDoc.getElementsByTagName('name')[0]?.textContent || 'Imported Map';

        for (let placemark of placemarks) {
            let name = placemark.getElementsByTagName('name')[0]?.textContent || '';
            // Remove distance suffix from name only if it ends with m, M, м, or М
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
                    lineCoords = coords.split(/\s+/).map(coord => {
                        const [lon, lat] = coord.split(',').map(parseFloat);
                        return !isNaN(lat) && !isNaN(lon) ? [lon, lat] : null;
                    }).filter(coord => coord !== null);
                }
            }
        }

        // Check distance between first and second points
        if (points.length >= 2) {
            const from = turf.point([points[0].lon, points[0].lat]);
            const to = turf.point([points[1].lon, points[1].lat]);
            const options = { units: 'meters' };
            const distance = turf.distance(from, to, options);

            if (distance < 50) {
                // Skip modal and load points directly in original order
                this.points = points;
                this.lineCoords = lineCoords;
                this.mapName = mapName;
                window.kmlGenerator.loadPointsIntoUI(points, mapName);
                return null; // Return null to indicate no modal needed
            }
        }

        // Default behavior: prepare for modal
        this.points = points;
        this.lineCoords = lineCoords;
        this.mapName = mapName;
        return { points, lineCoords, mapName };
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

    modal.style.display = 'block'; // Ensure modal is visible
    document.getElementById('startPointModalBackdrop').style.display = 'block';
    modal.classList.add('show');
    document.getElementById('startPointModalBackdrop').classList.add('show');
    console.log('Start Point Modal opened'); // Debug log
}
};
