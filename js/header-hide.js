const header = document.querySelector('header');
const scrollBtn = document.getElementById('scrollTopBtn');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    // Логика хедера
    if (currentScroll > lastScroll && currentScroll > 100) {
        header.style.top = "-100px"; // скрыть
    } else {
        header.style.top = "0"; // показать
    }

    // Логика кнопки
    if (currentScroll > 300) {
        scrollBtn.classList.add('show');
    } else {
        scrollBtn.classList.remove('show');
    }

    lastScroll = currentScroll;
});

// Клик по кнопке — плавный скролл вверх
scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Mobile menu toggle ──
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        mainNav.classList.toggle('open');
    });

    // Закрытие меню при клике на ссылку
    mainNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menuToggle.classList.remove('active');
            mainNav.classList.remove('open');
        });
    });
}

// ── Dynamic year in footer ──
const yearElement = document.getElementById('currentYear');
if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}

// ── Mobile dropdown toggle ──
const dropdownToggle = document.querySelector('.dropdown-toggle');
const dropdown = document.querySelector('.dropdown');

if (dropdownToggle && dropdown) {
    dropdownToggle.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            dropdown.classList.toggle('open');
        }
    });

    // Закрытие dropdown при клике вне
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && window.innerWidth <= 768) {
            dropdown.classList.remove('open');
        }
    });
}