// theme.js – управление тёмной/светлой темой
(function() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return; // если кнопки нет на странице, ничего не делаем

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');

    // Устанавливаем начальную тему
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    // Обработчик клика
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
})();