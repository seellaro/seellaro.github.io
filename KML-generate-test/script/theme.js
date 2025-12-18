// theme.js
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

    // Инициализация темы при загрузке
    const storedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (!storedTheme && prefersDark);

    document.body.classList.toggle('dark-theme', isDark);
    setBackground(isDark ? darkColors : lightColors);

    // Элемент карты (уже объявлен в main.js)
    const mapElement = document.getElementById('map');

    function toggleTheme() {
        const isDark = document.body.classList.contains('dark-theme');
        const startColors = isDark ? darkColors : lightColors;
        const endColors = isDark ? lightColors : darkColors;
        const duration = 500;      // длительность анимации фона
        const fadeDuration = 250;  // длительность fade карты
        const startTime = performance.now();
        const newIsDark = !isDark;

        // Отключаем pointer-events на контейнере карты во время анимации
        mapElement.style.pointerEvents = 'none';

        const fadeOut = function animateFadeOut(currentTime) {
            const elapsed = currentTime - startTime;
            const factor = Math.min(elapsed / fadeDuration, 1);
            const opacity = 1 - factor;
            mapElement.style.opacity = opacity;

            if (factor < 1) {
                requestAnimationFrame(animateFadeOut);
            } else {
                // Меняем класс темы и сохраняем в localStorage
                document.body.classList.toggle('dark-theme');
                localStorage.setItem(THEME_KEY, newIsDark ? 'dark' : 'light');

                // Меняем тему схемы Яндекса
                if (window.schemeLayer) {
                    window.schemeLayer.update({ theme: newIsDark ? 'dark' : 'light' });
                }

                // Здесь позже будем обновлять стили точек и линий (этапы 6+)

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
                        // Включаем обратно pointer-events
                        mapElement.style.pointerEvents = 'auto';
                    }
                };
                requestAnimationFrame(fadeIn);
            }
        };
        requestAnimationFrame(fadeOut);
    }

    // Кнопка переключения темы
    document.getElementById('toggleThemeButton').addEventListener('click', toggleTheme);
});