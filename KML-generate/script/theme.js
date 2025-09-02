document.addEventListener('DOMContentLoaded', function () {
    const lightColors = [
        { r: 251, g: 214, b: 250, stop: 17 },
        { r: 229, g: 245, b: 255, stop: 100 }
    ];
    const darkColors = [
        { r: 50, g: 30, b: 50, stop: 17 },
        { r: 30, g: 50, b: 70, stop: 100 }
    ];
    const THEME_KEY = 'theme';

    function setBackground(colors) {
        document.body.style.background = `linear-gradient(36deg, rgb(${colors[0].r}, ${colors[0].g}, ${colors[0].b}) ${colors[0].stop}%, rgb(${colors[1].r}, ${colors[1].g}, ${colors[1].b}) ${colors[1].stop}%)`;
    }

    function interpolateColor(color1, color2, factor) {
        return {
            r: Math.round(color1.r + (color2.r - color1.r) * factor),
            g: Math.round(color1.g + (color2.g - color1.g) * factor),
            b: Math.round(color1.b + (color2.b - color1.b) * factor),
            stop: color1.stop
        };
    }

    function interpolateColors(colors1, colors2, factor) {
        return colors1.map((color1, index) => interpolateColor(color1, colors2[index], factor));
    }

    const storedTheme = localStorage.getItem(THEME_KEY);
    const isDark = storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark-theme', isDark);
    setBackground(isDark ? darkColors : lightColors);

    function toggleTheme() {
        const isDark = document.body.classList.contains('dark-theme');
        const startColors = isDark ? darkColors : lightColors;
        const endColors = isDark ? lightColors : darkColors;
        const duration = 500;
        const fadeDuration = 250;
        const startTime = performance.now();
        const newIsDark = !isDark;

        const { map, baseLayer, pointLayer, lineLayer, buildingLayer, getPointStyle, getLineStyle, getBuildingStyle, mapElement } = window.kmlGenerator;

        map.getInteractions().forEach(interaction => interaction.setActive(false));

        const fadeOut = function animateFadeOut(currentTime) {
            const elapsed = currentTime - startTime;
            const factor = Math.min(elapsed / fadeDuration, 1);
            const opacity = 1 - factor;
            mapElement.style.opacity = opacity;

            if (factor < 1) {
                requestAnimationFrame(animateFadeOut);
            } else {
                document.body.classList.toggle('dark-theme');
                localStorage.setItem(THEME_KEY, newIsDark ? 'dark' : 'light');

                baseLayer.setSource(new ol.source.XYZ({
                    url: newIsDark ? 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' : 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    attributions: '© CartoDB'
                }));
                pointLayer.setStyle(getPointStyle);
                lineLayer.setStyle(getLineStyle);
                buildingLayer.setStyle(getBuildingStyle);

                const fadeInStartTime = performance.now();
                const fadeIn = function animateFadeIn(currentTime) {
                    const elapsed = currentTime - fadeInStartTime;
                    const factor = Math.min(elapsed / fadeDuration, 1);
                    const opacity = factor;
                    mapElement.style.opacity = opacity;

                    const bgFactor = Math.min(elapsed / duration, 1);
                    const easeFactor = 1 - Math.pow(1 - bgFactor, 3);
                    const currentColors = interpolateColors(startColors, endColors, easeFactor);
                    setBackground(currentColors);

                    if (factor < 1 || bgFactor < 1) {
                        requestAnimationFrame(fadeIn);
                    } else {
                        map.getInteractions().forEach(interaction => interaction.setActive(true));
                        map.render();
                    }
                }
                requestAnimationFrame(fadeIn);
            }
        }
        requestAnimationFrame(fadeOut);
    }

    document.getElementById('toggleThemeButton').addEventListener('click', toggleTheme);
});
