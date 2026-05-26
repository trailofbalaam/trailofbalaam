/**
 * Конвертирует Markdown-файлы из папки content/ в HTML-страницы.
 *
 * Использование:
 *   1. Установите зависимости: npm install marked
 *   2. Запустите скрипт:   node convert-md.js
 *
 * Тема страницы задаётся первой строкой .md файла:
 *   <!-- theme: mage -->   — применит класс theme-mage к <body>
 *   <!-- theme: fairy -->  — применит класс theme-fairy к <body>
 *   <!-- theme: werewolf --> — применит класс theme-werewolf к <body>
 *   <!-- theme: human -->  — применит класс theme-human к <body>
 *   (если комментария нет, используется дефолтная вампирская тема :root)
 *
 * Все .md файлы из content/ будут преобразованы и сохранены как .html в корне.
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');

// ── Порядок рас для пагинации ──
const RACE_ORDER = [
    { file: 'vampires', label: 'Вампиры' },
    { file: 'mages', label: 'Маги' },
    { file: 'werewolves', label: 'Оборотни' },
    { file: 'fairies', label: 'Феи' },
    { file: 'humans-hunters', label: 'Люди и Охотники' },
    { file: 'spiritual-world', label: 'Духовный мир' },
];

// Проверяем, существует ли папка content/
if (!fs.existsSync(CONTENT_DIR)) {
    console.error('Папка content/ не найдена. Создайте её и добавьте .md файлы.');
    process.exit(1);
}

// Читаем шаблон
if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error('Файл template.html не найден в корне проекта.');
    process.exit(1);
}

const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

// Пытаемся загрузить marked
let marked;
try {
    marked = require('marked');
} catch (e) {
    console.error(
        'Пакет "marked" не установлен. Выполните: npm install marked'
    );
    console.log(
        '\nАльтернатива: скрипт может работать без marked (базовая конвертация).'
    );
    console.log('Вставьте HTML напрямую в содержимое .md файла.\n');
}

// ── Утилиты пост-обработки ──────────────────────────────────────────────

/**
 * Генерирует id-слаг из текста заголовка.
 * Пример: "Бывшее общество оборотней" → "бывшее-общество-оборотней"
 */
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[«»""''„"]/g, '')   // убрать кавычки
        .replace(/[^а-яёa-z0-9\s-]/g, '') // оставить только буквы/цифры/пробелы/дефисы
        .replace(/[\s]+/g, '-')        // пробелы → дефис
        .replace(/-+/g, '-')           // схлопнуть повторяющиеся дефисы
        .replace(/^-|-$/g, '');        // убрать дефисы по краям
}

/**
 * Извлекает текст первого h1 из HTML.
 */
function extractH1Text(html) {
    const match = html.match(/<h1[^>]*>([^<]*)<\/h1>/);
    return match ? match[1].trim() : '';
}

/**
 * Пост-обработка HTML после marked.parse():
 *  - h1 получает class="title"
 *  - h2 получают id (слаг)
 *  - img получают class="section-img", путь до assets/, loading="lazy", убирается обёртка <p>
 *  - блок «Оглавление» превращается в div.toc с якорными ссылками.
 *    Два режима:
 *      Простой: если в списке нет <strong>/<em> — плоский список <li><a>
 *      Расширенный: если есть <strong>/<em> — пункты с <strong> становятся
 *        заголовками секций (с <br> перед ними), обычные пункты — подпунктами
 */
function postProcess(html) {
    // 1. h1 → <h1 class="title"> (только первый)
    html = html.replace(/<h1>/, '<h1 class="title">');

    // 2. Эпиграф: первый <blockquote> после <h1> → <div class="epigraph">
    html = html.replace(
        /(<h1 class="title">[^<]*<\/h1>)\s*<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/,
        (match, h1, inner) => {
            const cleaned = inner
                .replace(/<p>/g, '')
                .replace(/<\/p>/g, '')
                .replace(/<br\s*\/?>/g, '\n')
                .trim();
            return `${h1}\n<div class="epigraph">\n${cleaned}\n</div>`;
        }
    );

    // 2. h2 → <h2 id="...">
    html = html.replace(/<h2>([^<]*)<\/h2>/g, (match, text) => {
        const id = slugify(text);
        return `<h2 id="${id}">${text}</h2>`;
    });

    // 2b. h3 → <h3 id="...">
    html = html.replace(/<h3>([^<]*)<\/h3>/g, (match, text) => {
        const id = slugify(text);
        return `<h3 id="${id}">${text}</h3>`;
    });

    // 3. img: убрать обёртку <p><img ...></p>, добавить class, префикс пути и loading="lazy"
    html = html.replace(/<p>\s*<img\s+src="([^"]+)"\s+alt="([^"]*)"\s*\/?>\s*<\/p>/g, (match, src, alt) => {
        let imgSrc = src;
        if (!/^https?:\/\//.test(src) && !src.startsWith('assets/')) {
            imgSrc = 'assets/' + src;
        }
        return `<img src="${imgSrc}" alt="${alt}" class="section-img" loading="lazy">`;
    });

    // 4. Оглавление: найти <p><strong>Оглавление:</strong></p><ul>...</ul>
    //    и заменить на <div class="toc"><h3>Оглавление</h3><ul> с якорями
    html = html.replace(
        /<p><strong>Оглавление:<\/strong><\/p>\s*<ul>\s*([\s\S]*?)<\/ul>/,
        (match, listContent) => {
            // 1. Убрать обёртку <p> внутри <li> (marked добавляет её для сложного контента)
            let cleaned = listContent.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, '<li>$1</li>');

            // 2. Убрать ; в конце текста (перед </li>)
            cleaned = cleaned.replace(/;(<\/li>)/g, '$1');

            // 3. Собрать все <li>...</li> в массив
            const liMatches = [...cleaned.matchAll(/<li>([\s\S]*?)<\/li>/g)];
            const hasBoldOrEm = liMatches.some(m => /<(strong|em)>/.test(m[1]));

            const makeLink = (text, slug) => `<li><a href="#${slug}">${text}</a></li>`;

            let resultItems = '';

            if (!hasBoldOrEm) {
                // ── Режим 1: Простой (все пункты одинаковые) ──
                liMatches.forEach((m) => {
                    const cleanText = m[1].trim();
                    const slug = slugify(cleanText);
                    resultItems += makeLink(cleanText, slug) + '\n';
                });
            } else {
                // ── Режим 2: Расширенный (с <strong>/<em> заголовками секций) ──
                let isFirst = true;
                liMatches.forEach((m) => {
                    let inner = m[1];

                    // <em> → <strong>
                    if (/<em>/.test(inner)) {
                        inner = inner.replace(/<em>/g, '<strong>').replace(/<\/em>/g, '</strong>');
                    }

                    if (/<strong>/.test(inner)) {
                        // Заголовок секции: оборачиваем в <strong> с <br> перед (кроме первого)
                        const cleanText = inner.replace(/<\/?strong>/g, '').trim();
                        const slug = slugify(cleanText);

                        if (!isFirst) {
                            resultItems += '<br>\n';
                        }
                        resultItems += `<strong>\n                    ${makeLink(cleanText, slug)}\n                </strong>\n`;
                        isFirst = false;
                    } else {
                        // Обычный подпункт (— ...)
                        const cleanText = inner.trim();
                        const slug = slugify(cleanText);
                        resultItems += `${makeLink(cleanText, slug)}\n`;
                        isFirst = false;
                    }
                });
            }

            return `<div class="toc">\n            <h3>Оглавление:</h3>\n\n            <ul>\n                ${resultItems}            </ul>\n        </div>`;
        }
    );

    return html;
}

/**
 * Генерирует блок пагинации (предыдущая / следующая раса).
 */
function generatePagination(baseName) {
    const idx = RACE_ORDER.findIndex(r => r.file === baseName);
    if (idx === -1) return '';

    let prevLink = '';
    let nextLink = '';

    if (idx > 0) {
        const prev = RACE_ORDER[idx - 1];
        prevLink = `<a href="${prev.file}.html" class="prev">${prev.label}</a>`;
    } else {
        prevLink = `<span></span>`;
    }

    if (idx < RACE_ORDER.length - 1) {
        const next = RACE_ORDER[idx + 1];
        nextLink = `<a href="${next.file}.html" class="next">${next.label}</a>`;
    } else {
        nextLink = `<span></span>`;
    }

    return `<div class="race-pagination">\n    ${prevLink}\n    ${nextLink}\n</div>`;
}

/**
 * Генерирует название расы для хлебной крошки.
 */
function getBreadcrumbLabel(baseName) {
    const found = RACE_ORDER.find(r => r.file === baseName);
    return found ? found.label : baseName;
}

// ── Основной цикл конвертации ──────────────────────────────────────────

// Получаем все .md файлы
const mdFiles = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => path.extname(file).toLowerCase() === '.md');

if (mdFiles.length === 0) {
    console.log('Нет .md файлов в content/. Добавьте файлы для конвертации.');
    process.exit(0);
}

mdFiles.forEach((file) => {
    const mdPath = path.join(CONTENT_DIR, file);
    const rawContent = fs.readFileSync(mdPath, 'utf-8');
    const baseName = path.basename(file, '.md');
    const htmlOutputPath = path.join(__dirname, `${baseName}.html`);

    // ── Извлечение темы из первой строки (HTML-комментарий) ──
    let theme = null;
    let mdContent = rawContent;
    const firstLine = rawContent.split(/\r?\n/)[0].trim();
    const themeMatch = firstLine.match(/<!--\s*theme:\s*(\w+)\s*-->/);
    if (themeMatch) {
        theme = themeMatch[1].toLowerCase();
        // Удаляем строку с комментарием темы из контента
        mdContent = rawContent.slice(rawContent.indexOf('\n') + 1);
    }

    let htmlContent;

    if (marked) {
        // Конвертируем Markdown → HTML через marked
        htmlContent = marked.parse(mdContent);
    } else {
        // Без marked: оборачиваем в <p> (примитивная конвертация)
        htmlContent = mdContent
            .split(/\n\n+/)
            .map((block) => {
                block = block.trim();
                if (!block) return '';
                // Заголовки
                if (/^#### /.test(block))
                    return block.replace(/^#### (.+)/, '<h4>$1</h4>');
                if (/^### /.test(block))
                    return block.replace(/^### (.+)/, '<h3>$1</h3>');
                if (/^## /.test(block))
                    return block.replace(/^## (.+)/, '<h2>$1</h2>');
                if (/^# /.test(block))
                    return block.replace(/^# (.+)/, '<h1 class="title">$1</h1>');
                // blockquote
                if (/^> /.test(block))
                    return (
                        '<blockquote>' +
                        block.replace(/^> /gm, '') +
                        '</blockquote>'
                    );
                // списки
                if (/^- /.test(block)) {
                    const items = block
                        .split('\n')
                        .map((l) => '<li>' + l.replace(/^- /, '') + '</li>')
                        .join('');
                    return '<ul>' + items + '</ul>';
                }
                return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
            })
            .join('\n');
    }

    // ── Пост-обработка (только для marked) ──
    if (marked) {
        htmlContent = postProcess(htmlContent);
    }

    // ── Извлечение заголовка для <title> ──
    let pageTitle = extractH1Text(htmlContent);
    if (pageTitle) {
        pageTitle = 'Bloody Trail — ' + pageTitle;
    } else {
        pageTitle = 'Bloody Trail';
    }

    // ── Хлебная крошка ──
    const breadcrumbLabel = getBreadcrumbLabel(baseName);

    // ── Пагинация ──
    const paginationHtml = generatePagination(baseName);

    // Вставляем в шаблон
    let result = template.replace('{{content}}', htmlContent);

    // Подстановка класса темы в <body>
    if (theme) {
        result = result.replace('<body>', `<body class="theme-${theme}">`);
    }

    // Подстановка <title>
    result = result.replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`);

    // Подстановка хлебной крошки
    result = result.replace('{{breadcrumb}}', breadcrumbLabel);

    // Подстановка пагинации
    result = result.replace('{{pagination}}', paginationHtml);

    fs.writeFileSync(htmlOutputPath, result, 'utf-8');
    console.log(`✓ ${file} → ${baseName}.html` + (theme ? ` (тема: ${theme})` : ''));
});

console.log(`\nГотово! Обработано файлов: ${mdFiles.length}`);