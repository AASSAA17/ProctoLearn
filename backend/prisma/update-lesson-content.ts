import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Real educational content for HTML & CSS course
const htmlCssLessons: Array<{ title: string; content: string; assignmentAnswer: string; assignment: string }> = [
  {
    title: 'HTML нені білдіреді және браузер қалай жұмыс істейді?',
    content: `# HTML — Веб беттің негізі

HTML (HyperText Markup Language) — веб беттің құрылымын сипаттайтын тіл. Ол "жапсырмалар" (тегтер) арқылы жұмыс істейді.

## Браузер қалай жұмыс істейді?

1. Сіз браузерге URL терескізсіз (мысалы: google.com)
2. Браузер серверге HTTP сұраныс жібереді
3. Сервер HTML файлын қайтарады
4. Браузер HTML-ді оқып, DOM (Document Object Model) ағашын жасайды
5. CSS-ті қолданып, беттің сыртқы түрін қалыптастырады
6. JavaScript-ті іске қосып, беттің өзара əрекетін қамтамасыз етеді

## Ең қарапайым HTML беті

\`\`\`html
<!DOCTYPE html>
<html lang="kk">
  <head>
    <meta charset="UTF-8">
    <title>Менің бетім</title>
  </head>
  <body>
    <h1>Сәлем, Дүние!</h1>
    <p>Бұл менің бірінші веб-бетім.</p>
  </body>
</html>
\`\`\`

## Маңызды терминдер

| Термин | Мағынасы |
|--------|---------|
| \`<!DOCTYPE html>\` | HTML5 стандартын хабарлайды |
| \`<html>\` | Барлық мазмұнды қамтиды |
| \`<head>\` | Бет туралы мета-ақпарат |
| \`<body>\` | Бетте көрінетін мазмұн |

## Тег синтаксисі

\`\`\`html
<tagname attribute="value">мазмұн</tagname>
\`\`\`

Ашылатын тег: \`<p>\`
Жабылатын тег: \`</p>\`
Өздігінен жабылатын тег: \`<img src="photo.jpg" />\`

## Кеңес

Барлық HTML файлдар \`.html\` кеңейтімімен сақталады. Бастапқы файл әдетте \`index.html\` деп аталады — бұл браузер бірінші іздейтін файл.`,
    assignment: `Тапсырма: Мына HTML кодындағы бос орынды толтырыңыз.
Веб беттің негізгі мазмұны қандай тегке орналасады?

<html>
  <head>...</head>
  <___>Мазмұн осында</___>
</html>

Тек тег атауын жазыңыз (мысалы: body)`,
    assignmentAnswer: 'body',
  },
  {
    title: 'HTML тегтері: тақырыптар, параграфтар, сілтемелер',
    content: `# Негізгі HTML тегтері

## Тақырып тегтері (h1–h6)

Тақырыптар SEO үшін маңызды. \`h1\` — ең маңызды, \`h6\` — ең аз маңызды.

\`\`\`html
<h1>Бетаналық тақырып</h1>
<h2>Бөлім тақырыбы</h2>
<h3>Кіші бөлім</h3>
\`\`\`

**Ереже:** Бір бетте тек БІР \`<h1>\` болуы тиіс.

## Параграф тегі

\`\`\`html
<p>Бұл параграф мәтіні. Браузер автоматты түрде жол үзісін қосады.</p>
<p>Екінші параграф.</p>
\`\`\`

## Сілтеме тегі (anchor)

\`\`\`html
<!-- Сыртқы сілтеме -->
<a href="https://google.com" target="_blank">Google-ге өту</a>

<!-- Ішкі сілтеме -->
<a href="/about.html">Біз туралы</a>

<!-- Бет ішіндегі якор -->
<a href="#contact">Байланыс</a>
\`\`\`

**\`target="_blank"\`** — сілтемені жаңа қойындыда ашады.

## Мәтін пішімдеу

\`\`\`html
<strong>Қалың мәтін</strong>   <!-- маңызды -->
<em>Курсив мәтін</em>          <!-- екпін -->
<br>                            <!-- жол үзісі -->
<hr>                            <!-- көлденең сызық -->
\`\`\`

## Тізімдер

\`\`\`html
<!-- Нүктеленген (реттелмеген) -->
<ul>
  <li>Алма</li>
  <li>Банан</li>
</ul>

<!-- Нөмірленген (реттелген) -->
<ol>
  <li>Бірінші қадам</li>
  <li>Екінші қадам</li>
</ol>
\`\`\`

## Тәжірибе жасаңыз

VS Code-те \`index.html\` файл жасаңыз, \`!\` теріп, Tab басыңыз — автотолтыру кодты жасайды!`,
    assignment: `Тапсырма: Мына HTML-де қандай тег жетіспейді?

<ol>
  <___>Бірінші қадам</___>
  <li>Екінші қадам</li>
</ol>

Тек тег атауын жазыңыз (жауап: li)`,
    assignmentAnswer: 'li',
  },
  {
    title: 'HTML суреттер, кестелер, пішімдер',
    content: `# Медиа және деректер тегтері

## Сурет тегі

\`\`\`html
<img src="photo.jpg" alt="Суреттің сипаттамасы" width="400" height="300">
\`\`\`

- **\`src\`** — сурет жолы (URL немесе файл)
- **\`alt\`** — сурет жүктелмесе немесе экрандық оқырман үшін мәтін
- **\`width/height\`** — өлшемдер (px де, % де болады)

## Кесте

\`\`\`html
<table>
  <thead>
    <tr>
      <th>Аты</th>
      <th>Жасы</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Алибек</td>
      <td>25</td>
    </tr>
    <tr>
      <td>Айгерім</td>
      <td>22</td>
    </tr>
  </tbody>
</table>
\`\`\`

| Тег | Мағынасы |
|-----|---------|
| \`<table>\` | Кесте контейнері |
| \`<thead>\` | Тақырып жолдары |
| \`<tbody>\` | Негізгі деректер |
| \`<tr>\` | Кесте жолы (Table Row) |
| \`<th>\` | Тақырып ұяшығы (Table Header) |
| \`<td>\` | Деректер ұяшығы (Table Data) |

## Пішім (Form)

\`\`\`html
<form method="post" action="/submit">
  <label for="name">Аты-жөні:</label>
  <input type="text" id="name" name="name" placeholder="Атыңызды енгізіңіз">

  <label for="email">Email:</label>
  <input type="email" id="email" name="email">

  <label for="message">Хабарлама:</label>
  <textarea id="message" name="message" rows="4"></textarea>

  <button type="submit">Жіберу</button>
</form>
\`\`\`

## input түрлері

\`\`\`html
<input type="text">      <!-- мәтін -->
<input type="email">     <!-- email (валидация бар) -->
<input type="password">  <!-- пароль (жасырылады) -->
<input type="number">    <!-- сан -->
<input type="checkbox">  <!-- флажок -->
<input type="radio">     <!-- дөңгелек таңдау -->
<input type="file">      <!-- файл жүктеу -->
\`\`\``,
    assignment: `Тапсырма: Кестедегі тақырып ұяшығына қолданылатын тег қайсысы?

<table>
  <tr>
    <___>Аты</___>   ← тақырып ұяшығы
    <td>Мәні</td>    ← деректер ұяшығы
  </tr>
</table>

Тек тег атауын жазыңыз (жауап: th)`,
    assignmentAnswer: 'th',
  },
  {
    title: 'CSS-ке кіріспе: стильдер қалай жұмыс істейді',
    content: `# CSS — Веб Беттің Сыртқы Түрі

CSS (Cascading Style Sheets) — HTML элементтерінің сыртқы түрін (түс, өлшем, орналасу) анықтайды.

## CSS-ті HTML-ге қосудың 3 жолы

### 1. Сыртқы CSS файлы (ең жақсы тәсіл)
\`\`\`html
<head>
  <link rel="stylesheet" href="styles.css">
</head>
\`\`\`

### 2. \`<style>\` тегі ішінде
\`\`\`html
<head>
  <style>
    p { color: blue; }
  </style>
</head>
\`\`\`

### 3. Inline стиль (болдырмаңыз)
\`\`\`html
<p style="color: blue;">Мәтін</p>
\`\`\`

## CSS синтаксисі

\`\`\`css
selector {
  property: value;
  property: value;
}
\`\`\`

Мысал:
\`\`\`css
h1 {
  color: #2563eb;        /* түс */
  font-size: 32px;       /* мөлшер */
  font-weight: bold;     /* қалыңдық */
  text-align: center;    /* туралау */
}

p {
  color: #374151;
  line-height: 1.6;      /* жол биіктігі */
  max-width: 700px;      /* максимум кеңдік */
}
\`\`\`

## Селекторлар

\`\`\`css
/* Тег селекторы */
p { color: gray; }

/* Класс селекторы (. белгісі) */
.card { background: white; }

/* ID селекторы (# белгісі) */
#header { background: navy; }

/* Комбинациялық */
.card h2 { font-size: 20px; }  /* .card ішіндегі h2 */
\`\`\`

## Маңызды CSS қасиеттері

| Қасиет | Мысал | Мағынасы |
|--------|-------|---------|
| \`color\` | \`color: red\` | Мәтін түсі |
| \`background-color\` | \`background-color: #fff\` | Фон түсі |
| \`font-size\` | \`font-size: 16px\` | Мөлшер |
| \`margin\` | \`margin: 20px\` | Сыртқы шегініс |
| \`padding\` | \`padding: 10px\` | Ішкі шегініс |
| \`border\` | \`border: 1px solid gray\` | Шекара |
| \`width/height\` | \`width: 100%\` | Өлшем |`,
    assignment: `Тапсырма: CSS-те класс атауын белгілеу үшін қандай символ қолданылады?

Мысалы: .card, .btn, .header

Тек символды жазыңыз (жауап: .)`,
    assignmentAnswer: '.',
  },
  {
    title: 'CSS Box Model: margin, padding, border',
    content: `# CSS Box Model

Әрбір HTML элемент — бұл "қорап" (box). Box Model қораптың қалай өлшенетінін анықтайды.

## Box Model құрылымы

\`\`\`
┌───────────────────────────────┐
│           MARGIN              │  ← сыртқы бос кеңістік
│  ┌────────────────────────┐   │
│  │        BORDER          │   │  ← шекара
│  │  ┌──────────────────┐  │   │
│  │  │     PADDING      │  │   │  ← ішкі бос кеңістік
│  │  │  ┌────────────┐  │  │   │
│  │  │  │  CONTENT   │  │  │   │  ← мазмұн
│  │  │  └────────────┘  │  │   │
│  │  └──────────────────┘  │   │
│  └────────────────────────┘   │
└───────────────────────────────┘
\`\`\`

## Мысал

\`\`\`css
.card {
  /* Мазмұн */
  width: 300px;
  height: 200px;

  /* Ішкі шегініс (мазмұн мен шекара арасы) */
  padding: 20px;          /* барлық жақтан */
  padding-top: 10px;      /* тек жоғарыдан */
  padding: 10px 20px;     /* жоғары/төмен | оң/сол */

  /* Шекара */
  border: 2px solid #e5e7eb;
  border-radius: 12px;    /* дөңгелектелген бұрыштар */

  /* Сыртқы шегініс (элементтер арасы) */
  margin: 16px;           /* барлық жақтан */
  margin: 0 auto;         /* солжақ/оңжақ авто = ортаға */
}
\`\`\`

## box-sizing

**Маңызды!** Әдепкі жағдайда \`width\` тек мазмұнды өлшейді.

\`\`\`css
/* Ескі (проблемалық) жол: */
/* width: 300px + padding: 20px = жалпы 340px */

/* Жаңа (ұсынылады): */
* {
  box-sizing: border-box;  /* width padding-ды қосады */
}
/* Енді width: 300px = мазмұн + padding + border = 300px */
\`\`\`

## display қасиеті

\`\`\`css
div    { display: block; }    /* толық кеңдік алады, жаңа жолдан */
span   { display: inline; }   /* тек мазмұн кеңдігі, бір жолда */
img    { display: inline-block; } /* inline + width/height қабылдайды */
.hide  { display: none; }     /* элементті жасырады */
\`\`\`

## Практика

DevTools-та (F12) кез келген элементті таңдаңыз — "Computed" қойындысында оның Box Model-ін көруге болады.`,
    assignment: `Тапсырма: Элементтер АРАСЫНДАҒЫ бос кеңістікті беретін CSS қасиеті қайсысы?

Мысалы: div { ___: 20px; }

Тек қасиет атауын жазыңыз (жауап: margin)`,
    assignmentAnswer: 'margin',
  },
  {
    title: 'CSS Flexbox: заманауи орналасу',
    content: `# Flexbox — Икемді Орналасу

Flexbox элементтерді жол немесе баған бойынша реттеуді жеңілдетеді.

## Іске қосу

\`\`\`css
.container {
  display: flex;        /* flex контейнер жасайды */
}
\`\`\`

Осыдан кейін \`.container\` ішіндегі барлық тікелей балалар flex элементтер болады.

## Негізгі қасиеттер (контейнерде)

\`\`\`css
.container {
  display: flex;

  /* Бағыт */
  flex-direction: row;          /* → оңға (әдепкі) */
  flex-direction: column;       /* ↓ төмен */
  flex-direction: row-reverse;  /* ← солға */

  /* Негізгі осьте туралау */
  justify-content: flex-start;    /* сол жақ */
  justify-content: center;        /* ортаға */
  justify-content: flex-end;      /* оң жақ */
  justify-content: space-between; /* арасына тең бөлу */
  justify-content: space-around;  /* айналасына тең бөлу */

  /* Айқас осьте туралау */
  align-items: flex-start;  /* жоғары */
  align-items: center;      /* ортаға */
  align-items: flex-end;    /* төмен */
  align-items: stretch;     /* созу (әдепкі) */

  /* Ораналасу */
  flex-wrap: nowrap;    /* бір жолда (әдепкі) */
  flex-wrap: wrap;      /* орайды */

  /* Элементтер арасындағы бос орын */
  gap: 16px;            /* барлық арада */
  gap: 8px 16px;        /* жол | баған */
}
\`\`\`

## Flex элементте (балаларда)

\`\`\`css
.item {
  flex: 1;          /* қалған орынды тола */
  flex: 2;          /* flex: 1 болғандан 2 есе кең */
  flex: 0 0 200px;  /* өлшемін өзгертпе, 200px бол */
}
\`\`\`

## Жиі қолданылатын паттерн

\`\`\`css
/* Ортаға туралау */
.center-me {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Навигация: лого + сілтемелер */
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Карточка торы */
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.grid-item {
  flex: 1 1 300px; /* min 300px, өсе алады */
}
\`\`\`

## Ойын арқылы үйрену

**Flexbox Froggy** ойынын ойнаңыз: https://flexboxfroggy.com/`,
    assignment: `Тапсырма: Flex контейнерінде элементтерді тігінен ОРТАҒА туралайтын қасиет?

.container {
  display: flex;
  ___: center;
}

Тек қасиет атауын жазыңыз (жауап: align-items)`,
    assignmentAnswer: 'align-items',
  },
  {
    title: 'CSS Grid: тор жүйесі',
    content: `# CSS Grid — Екі өлшемді тор

Flexbox — бір өлшем (жол немесе баған).
Grid — екі өлшем бір мезгілде (жол + баған).

## Іске қосу

\`\`\`css
.grid-container {
  display: grid;

  /* 3 баған: әрқайсысы тең кеңдікте */
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-columns: repeat(3, 1fr); /* жоғарымен бірдей */

  /* Арнайы өлшемдер */
  grid-template-columns: 200px 1fr 200px;

  /* 2 жол: 100px + қалған орын */
  grid-template-rows: 100px 1fr;

  /* Элементтер арасы */
  gap: 24px;
  column-gap: 16px;
  row-gap: 8px;
}
\`\`\`

## fr бірлігі

\`fr\` — Grid-тегі бұрыш бірлігі (fraction = үлес).

\`\`\`css
grid-template-columns: 1fr 2fr 1fr;
/* 25% | 50% | 25% */
\`\`\`

## Элементтің орнын белгілеу

\`\`\`css
.header {
  grid-column: 1 / -1;  /* барлық бағандарға созылу */
}

.sidebar {
  grid-column: 1;        /* 1-ші баған */
  grid-row: 1 / 3;       /* 1-ден 3-ке дейін (2 жол) */
}

.main {
  grid-column: 2 / -1;  /* 2-ші бағаннан соңына */
}
\`\`\`

## Аталған аймақтар

\`\`\`css
.layout {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  grid-template-columns: 250px 1fr;
  grid-template-rows: 60px 1fr 60px;
}

.header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main    { grid-area: main; }
.footer  { grid-area: footer; }
\`\`\`

## Responsive Grid

\`\`\`css
.cards {
  display: grid;
  /* auto-fill: сыяды ма — толтыра, min 280px */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}
\`\`\`

Бұл — экран өлшеміне қарай баған санын автоматты реттейді!`,
    assignment: `Тапсырма: CSS Grid-те 3 бірдей бағанды тор жасайтын нұсқа?

.grid {
  display: grid;
  grid-template-columns: repeat(___, 1fr);
}

Тек санды жазыңыз (жауап: 3)`,
    assignmentAnswer: '3',
  },
  {
    title: 'Responsive Design: медиа сұраулар',
    content: `# Responsive Design — Бейімделетін Дизайн

Responsive дизайн — сайтыңыздың барлық устройстводарда (телефон, планшет, компьютер) жақсы көрінуін қамтамасыз ету.

## Viewport Meta тегі

\`\`\`html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
\`\`\`

Бұл тегсіз мобилді браузерлер бетті кішіреймейді!

## Media Query синтаксисі

\`\`\`css
/* Мобилді: 0–767px */
@media (max-width: 767px) {
  .container { padding: 16px; }
  .nav { flex-direction: column; }
}

/* Планшет: 768–1023px */
@media (min-width: 768px) and (max-width: 1023px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Десктоп: 1024px+ */
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
\`\`\`

## Mobile First тәсілі (ұсынылады)

Алдымен мобилді стиль жазыңыз, содан кейін үлкен экраны үшін кеңейтіңіз:

\`\`\`css
/* Мобилді (базадан) */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* Планшет */
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Десктоп */
@media (min-width: 1200px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
\`\`\`

## Жиі қолданылатын Breakpoints

| Атауы | Кеңдік |
|-------|--------|
| Mobile (xs) | < 576px |
| Mobile (sm) | ≥ 576px |
| Tablet (md) | ≥ 768px |
| Laptop (lg) | ≥ 992px |
| Desktop (xl) | ≥ 1200px |

## Пайдалы CSS бірліктері

\`\`\`css
/* Тиянақты бірліктер */
width: 300px;      /* пиксел */
font-size: 16px;

/* Салыстырмалы бірліктер */
width: 50%;        /* ата-элементтен % */
font-size: 1.5rem; /* root font-size-тан (1rem = 16px) */
height: 100vh;     /* viewport биіктігі */
width: 100vw;      /* viewport кеңдігі */
\`\`\``,
    assignment: `Тапсырма: Mobile First тәсілінде мобилді стильден кейін үлкен экrans үшін қолданылатын CSS синтаксисі?

Тек екі сөзді жазыңыз (жауап: media query)`,
    assignmentAnswer: 'media query',
  },
];

// Real content for JavaScript Beginners
const jsBeginnersLessons: Array<{ title: string; content: string; assignment: string; assignmentAnswer: string }> = [
  {
    title: 'JavaScript нені білдіреді? Браузерде қалай іске қосылады?',
    content: `# JavaScript — Веб беттің Ойлау Мүмкіндігі

JavaScript (JS) — браузерде жұмыс істейтін бағдарламалау тілі. Ол веб беттерге өзара əрекет (интерактивтілік) береді.

## JavaScript не жасай алады?

- Батырмаларға клик өңдеу
- Деректерді тексеру (валидация)
- Анимация жасау  
- Сервермен деректер алмасу (AJAX)
- DOM (HTML) өзгерту
- Cookie, localStorage жұмысы

## Браузерде іске қосу

### 1. HTML ішінде (жылдам тексеру үшін)
\`\`\`html
<script>
  alert("Сәлем, JavaScript!");
</script>
\`\`\`

### 2. Сыртқы файл (ұсынылады)
\`\`\`html
<script src="app.js"></script>
\`\`\`

### 3. Browser Console (F12 → Console)
Браузерде F12 басыңыз → Console қойындысы → JS кодтарын жазуға болады.

## Алғашқы бағдарлама

\`\`\`javascript
console.log("Сәлем, Дүние!"); // Console-ға шығару
alert("Сәлем!");              // Терезе шығару
prompt("Атыңыз?");            // Деректер сұрату
\`\`\`

## Айнымалылар (Variables)

\`\`\`javascript
// Қазіргі заманауи жол:
let age = 25;          // өзгертуге болады
const name = "Алибек"; // өзгертуге БОЛМАЙДЫ

// Ескі жол (болдырмаңыз):
var score = 100;       // проблемалы
\`\`\`

## Деректер түрлері

\`\`\`javascript
let num    = 42;          // Number
let text   = "Сәлем";    // String
let flag   = true;        // Boolean
let nothing = null;       // Null
let undef;                // Undefined
let obj    = {};           // Object
let arr    = [];           // Array (List)
\`\`\`

## typeof операторы

\`\`\`javascript
console.log(typeof 42);       // "number"
console.log(typeof "hello");  // "string"
console.log(typeof true);     // "boolean"
console.log(typeof null);     // "object" (бұл JS-тегі баг!)
\`\`\``,
    assignment: `Тапсырма: JavaScript-те өзгертілмейтін (константа) айнымалы жариялайтын кілт сөз?

Тек кілт сөзді жазыңыз (жауап: const)`,
    assignmentAnswer: 'const',
  },
  {
    title: 'Операторлар, шарттар, салыстыру',
    content: `# JavaScript Операторлар & Шарттар

## Арифметикалық операторлар

\`\`\`javascript
let a = 10, b = 3;
console.log(a + b);  // 13 — қосу
console.log(a - b);  // 7  — алу
console.log(a * b);  // 30 — көбейту
console.log(a / b);  // 3.333... — бөлу
console.log(a % b);  // 1  — қалдық (модуль)
console.log(a ** b); // 1000 — дәреже (10³)
\`\`\`

## Салыстыру операторлары

\`\`\`javascript
console.log(5 == "5");  // true  (тек мән, ТИП ТЕКСЕРМЕЙДІ)
console.log(5 === "5"); // false (мән + тип — ҰСЫНЫЛАДЫ!)
console.log(5 != "5");  // false
console.log(5 !== "5"); // true
console.log(10 > 5);    // true
console.log(10 >= 10);  // true
\`\`\`

**Ереже:** Әрдайым \`===\` қолданыңыз, \`==\` емес!

## Логикалық операторлар

\`\`\`javascript
// && — ЖӘНЕ (екеуі де true болуы тиіс)
console.log(true && true);   // true
console.log(true && false);  // false

// || — НЕМЕСЕ (кем дегенде бірі true болуы тиіс)
console.log(false || true);  // true
console.log(false || false); // false

// ! — ЖОҚ (инверсия)
console.log(!true);   // false
console.log(!false);  // true
\`\`\`

## if/else шарты

\`\`\`javascript
let score = 75;

if (score >= 90) {
  console.log("Өте жақсы!");
} else if (score >= 70) {
  console.log("Жақсы!");
} else if (score >= 50) {
  console.log("Қанағаттанарлық");
} else {
  console.log("Қайта тапсыру керек");
}
\`\`\`

## Тернарлы оператор (қысқа if)

\`\`\`javascript
// Синтаксис: шарт ? шын болса : жалған болса
let age = 20;
let status = age >= 18 ? "Кәмелетке толған" : "Кәмелетке толмаған";
console.log(status); // "Кәмелетке толған"
\`\`\`

## switch операторы

\`\`\`javascript
let day = "дүйсенбі";

switch(day) {
  case "дүйсенбі":
    console.log("Жұмыс күні");
    break;
  case "сенбі":
  case "жексенбі":
    console.log("Демалыс");
    break;
  default:
    console.log("Жұмыс күні");
}
\`\`\``,
    assignment: `Тапсырма: JavaScript-те мән мен типті БІРДЕЙ тексеретін оператор?

Тек операторды жазыңыз (жауап: ===)`,
    assignmentAnswer: '===',
  },
];

async function main() {
  console.log('Updating lesson content with real educational material...\n');

  let updated = 0;

  // Update HTML & CSS course
  const htmlCourse = await prisma.course.findFirst({ where: { title: 'HTML и CSS с нуля' } });
  if (htmlCourse) {
    for (const lessonData of htmlCssLessons) {
      const lesson = await prisma.lesson.findFirst({
        where: { courseId: htmlCourse.id, order: htmlCssLessons.indexOf(lessonData) + 1 },
      });
      if (lesson) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            title: lessonData.title,
            content: lessonData.content,
            assignment: lessonData.assignment,
            assignmentAnswer: lessonData.assignmentAnswer,
          },
        });
        console.log(`✅ Updated: ${lessonData.title}`);
        updated++;
      }
    }
  }

  // Update JavaScript course
  const jsCourse = await prisma.course.findFirst({ where: { title: 'JavaScript для начинающих' } });
  if (jsCourse) {
    for (const lessonData of jsBeginnersLessons) {
      const lesson = await prisma.lesson.findFirst({
        where: { courseId: jsCourse.id, order: jsBeginnersLessons.indexOf(lessonData) + 1 },
      });
      if (lesson) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            title: lessonData.title,
            content: lessonData.content,
            assignment: lessonData.assignment,
            assignmentAnswer: lessonData.assignmentAnswer,
          },
        });
        console.log(`✅ Updated: ${lessonData.title}`);
        updated++;
      }
    }
  }

  console.log(`\n✅ Done! Updated ${updated} lessons with real content.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
