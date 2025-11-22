// theme.js
document.addEventListener('DOMContentLoaded', function () {
    // Определения градиентов для светлой и темной темы с разными цветами
    // Цвета теперь более серые (для темной) и пастельные (для светлой)
    const gradients = {
        light: {
            default: [
                { r: 245, g: 245, b: 245, stop: 0 },   // Светло-серый
                { r: 220, g: 220, b: 220, stop: 100 }  // Более темный серый
            ],
            '#FFDAB9': [ // Peach Puff -> Пастельно-персиковый
                { r: 255, g: 248, b: 220, stop: 0 }, // Cornsilk
                { r: 255, g: 239, b: 213, stop: 100 } // Papaya Whip
            ],
            '#f051b8': [ // Pink -> Пастельно-розовый
                { r: 255, g: 228, b: 225, stop: 0 }, // Misty Rose
                { r: 255, g: 218, b: 218, stop: 100 } // Thistle
            ],
            '#00FF00': [ // Lime Green -> Пастельно-зеленый
                { r: 240, g: 248, b: 240, stop: 0 }, // Alice Blue
                { r: 230, g: 255, b: 230, stop: 100 } // Honeydew
            ],
            '#16e5f0': [ // Light Blue -> Пастельно-голубой
                { r: 240, g: 248, b: 255, stop: 0 }, // Alice Blue
                { r: 230, g: 250, b: 255, stop: 100 } // Lavender
            ],
            '#FFA500': [ // Orange -> Пастельно-оранжевый
                { r: 255, g: 245, b: 220, stop: 0 }, // Sea Shell
                { r: 255, g: 235, b: 205, stop: 100 } // Papaya Whip
            ],
            '#fafa28': [ // Yellow -> Пастельно-желтый
                { r: 255, g: 255, b: 240, stop: 0 }, // Seashell
                { r: 255, g: 255, b: 224, stop: 100 } // Light Yellow
            ]
        },
        dark: {
            default: [
                { r: 30, g: 30, b: 30, stop: 0 },  // Очень темный серый
                { r: 50, g: 50, b: 50, stop: 100 } // Светлее, но все еще серый
            ],
            // Цвета для градиентов: более серые оттенки
            '#FFDAB9': [ // Peach Puff -> Темно-серый оттенок
                { r: 85, g: 85, b: 85, stop: 0 }, // Светло-серый
                { r: 65, g: 65, b: 65, stop: 100 }  // Темно-серый
            ],
            '#f051b8': [ // Pink -> Темно-серый оттенок
                { r: 85, g: 65, b: 85, stop: 0 }, // Серовато-фиолетовый
                { r: 65, g: 45, b: 65, stop: 100 } // Темно-серовато-фиолетовый
            ],
            '#00FF00': [ // Lime Green -> Темно-серый оттенок
                { r: 65, g: 85, b: 65, stop: 0 },   // Серовато-зеленый
                { r: 45, g: 65, b: 45, stop: 100 } // Темно-серовато-зеленый
            ],
            '#16e5f0': [ // Light Blue -> Темно-серый оттенок
                { r: 65, g: 85, b: 105, stop: 0 },   // Серовато-голубой
                { r: 45, g: 65, b: 85, stop: 100 } // Темно-серовато-голубой
            ],
            '#FFA500': [ // Orange -> Темно-серый оттенок
                { r: 105, g: 85, b: 65, stop: 0 }, // Серовато-оранжевый
                { r: 85, g: 65, b: 45, stop: 100 } // Темно-серовато-оранжевый
            ],
            '#fafa28': [ // Yellow -> Темно-серый оттенок
                { r: 105, g: 105, b: 65, stop: 0 }, // Серовато-желтый
                { r: 85, g: 85, b: 45, stop: 100 } // Темно-серовато-желтый
            ]
        }
    };

    // Определения цветов текста для светлой и темной темы
    const textColors = {
        light: {
            default: '#555555', // Менее черный цвет для светлой темы (сероватый)
            '#FFDAB9': '#555555', // Сероватый на светлом фоне
            '#f051b8': '#555555',
            '#00FF00': '#555555',
            '#16e5f0': '#555555',
            '#FFA500': '#555555',
            '#fafa28': '#555555'
        },
        dark: {
            default: '#FFDAB9', // Peach Puff по умолчанию для темной темы
            '#FFDAB9': '#FFDAB9', // Остается Peach Puff
            '#f051b8': '#FFB6C1', // Light Pink
            '#00FF00': '#98FB98', // Pale Green
            '#16e5f0': '#ADD8E6', // Light Blue
            '#FFA500': '#FFD580', // Светло-оранжевый
            '#fafa28': '#FFFF99'  // Светло-желтый
        }
    };

    const THEME_KEY = 'theme';
    const TEXT_COLOR_KEY = 'textColor';
    const SELECTED_COLOR_KEY = 'selectedColor';

    let currentTextColor = '#FFDAB9'; // Начальный цвет текста для темной темы
    let selectedColor = '#FFDAB9';
    let themeMode = 'dark'; // Начальный режим темы

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

    // --- НОВАЯ ФУНКЦИЯ: Получение цвета текста на основе текущей темы и выбранного цвета фона ---
    function getTextColorForCurrentThemeAndColor() {
        return textColors[themeMode][selectedColor] || textColors[themeMode].default;
    }

    // Загружаем сохраненные настройки
    const storedTheme = localStorage.getItem(THEME_KEY);
    const storedTextColor = localStorage.getItem(TEXT_COLOR_KEY);
    const storedSelectedColor = localStorage.getItem(SELECTED_COLOR_KEY);

    if (storedTheme) {
        themeMode = storedTheme;
    } else {
        themeMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.body.classList.toggle('dark-theme', themeMode === 'dark');
    document.body.classList.toggle('light-theme', themeMode === 'light');

    if (storedSelectedColor) {
        selectedColor = storedSelectedColor;
    }

    // --- ИСПРАВЛЕНО: Используем функцию для получения цвета текста ---
    if (storedTextColor) {
        currentTextColor = storedTextColor;
    } else {
        currentTextColor = getTextColorForCurrentThemeAndColor();
    }

    const currentGradients = gradients[themeMode];
    const bgColors = currentGradients[selectedColor] || currentGradients.default;
    setBackground(bgColors);

    function toggleTheme() {
        const isDark = themeMode === 'dark';
        const newIsDark = !isDark;
        themeMode = newIsDark ? 'dark' : 'light';
    
        const startColors = gradients[isDark ? 'dark' : 'light'][selectedColor] || gradients[isDark ? 'dark' : 'light'].default;
        const endColors = gradients[newIsDark ? 'dark' : 'light'][selectedColor] || gradients[newIsDark ? 'dark' : 'light'].default;
    
        const duration = 500;
        const fadeDuration = 250;
        const startTime = performance.now();
    
        const fadeOut = function animateFadeOut(currentTime) {
            const elapsed = currentTime - startTime;
            const factor = Math.min(elapsed / fadeDuration, 1);
    
            if (factor < 1) {
                requestAnimationFrame(animateFadeOut);
            } else {
                document.body.classList.toggle('dark-theme', newIsDark);
                document.body.classList.toggle('light-theme', !newIsDark);
                localStorage.setItem(THEME_KEY, newIsDark ? 'dark' : 'light');
    
                // --- ИСПРАВЛЕНО: Обновляем цвет текста через функцию ---
                currentTextColor = getTextColorForCurrentThemeAndColor();
                localStorage.setItem(TEXT_COLOR_KEY, currentTextColor);
                document.body.style.color = currentTextColor;
                updateStyles();
    
                const fadeInStartTime = performance.now();
                const fadeIn = function animateFadeIn(currentTime) {
                    const elapsed = currentTime - fadeInStartTime;
                    const factor = Math.min(elapsed / fadeDuration, 1);
                    const bgFactor = Math.min(elapsed / duration, 1);
                    const easeFactor = 1 - Math.pow(1 - bgFactor, 3);
                    const currentColors = interpolateColors(startColors, endColors, easeFactor);
                    setBackground(currentColors);
    
                    if (factor < 1 || bgFactor < 1) {
                        requestAnimationFrame(fadeIn);
                    }
                }
                requestAnimationFrame(fadeIn);
            }
        }
        requestAnimationFrame(fadeOut);
    }

    function updateStyles() {
        document.body.style.color = currentTextColor;
        
        const mainButtons = document.querySelectorAll('.main-buttons button');
        mainButtons.forEach(btn => btn.style.color = currentTextColor);

        const control = document.querySelectorAll('.control-panel button');
        control.forEach(btn => btn.style.color = currentTextColor);

        const lable = document.querySelectorAll('.lable');
        lable.forEach(btn => btn.style.color = currentTextColor);

        // --- ИСПРАВЛЕНО: Теперь обновляются и tab-item ---
        const tabItems = document.querySelectorAll('.tab-item');
        tabItems.forEach(item => item.style.color = currentTextColor);

        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.style.color = currentTextColor);

        const content = document.querySelectorAll('.tabs-content');
        content.forEach(btn => btn.style.color = currentTextColor);

        const statusBar = document.querySelector('.status-bar');
        statusBar.style.color = currentTextColor;
    }

    function changeTextColor(color) {
        currentTextColor = color;
        document.body.style.color = currentTextColor;
        updateStyles();
        localStorage.setItem(TEXT_COLOR_KEY, color);
    }

    function changeSelectedColor(color) {
        const previousColor = selectedColor;
        selectedColor = color;
        localStorage.setItem(SELECTED_COLOR_KEY, color);

        // --- ИСПРАВЛЕНО: Обновляем цвет текста через функцию ---
        const newTextColor = getTextColorForCurrentThemeAndColor();
        changeTextColor(newTextColor); // Это обновит стили и сохранит цвет

        const currentGradients = gradients[themeMode];
        const bgColors = currentGradients[selectedColor] || currentGradients.default;
        const startColors = currentGradients[previousColor] || currentGradients.default;
        const endColors = bgColors;

        const duration = 500;
        const startTime = performance.now();

        const animate = function updateGradient(currentTime) {
            const elapsed = currentTime - startTime;
            const factor = Math.min(elapsed / duration, 1);
            const easeFactor = 1 - Math.pow(1 - factor, 3);
            const currentColors = interpolateColors(startColors, endColors, easeFactor);
            setBackground(currentColors);

            if (factor < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }

    // --- НОВОЕ: Круговой эффект при выборе цвета ---
    function createRipple(event, element) {
        const circle = document.createElement("span");
        const diameter = Math.max(element.clientWidth, element.clientHeight);
        const radius = diameter / 2;

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - element.offsetLeft - radius}px`;
        circle.style.top = `${event.clientY - element.offsetTop - radius}px`;
        circle.classList.add("ripple");

        const rippleOverlay = document.createElement("div");
        rippleOverlay.classList.add("ripple-overlay");
        const currentGradients = gradients[themeMode][selectedColor] || gradients[themeMode].default;
        const bgColor = `rgb(${currentGradients[0].r}, ${currentGradients[0].g}, ${currentGradients[0].b})`;
        rippleOverlay.style.background = `radial-gradient(circle, ${bgColor} 0%, transparent 70%)`;

        element.appendChild(rippleOverlay);
        rippleOverlay.appendChild(circle);

        setTimeout(() => {
            rippleOverlay.remove();
        }, 600);
    }

    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            createRipple(e, e.currentTarget);
            changeSelectedColor(e.target.dataset.color);
        });
    });
    
    document.getElementById('toggleThemeButton').addEventListener('click', toggleTheme);

    // --- ИСПРАВЛЕНО: Инициализация стилей после всех настроек ---
    updateStyles();
});
