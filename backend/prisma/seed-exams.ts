import { PrismaClient, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();

interface QuestionData {
  text: string;
  options: string[];
  answer: string;
}

interface ExamData {
  courseTitle: string;
  examTitle: string;
  duration: number;
  passScore: number;
  questions: QuestionData[];
}

const examsData: ExamData[] = [
  // ── HTML & CSS ──────────────────────────────────
  {
    courseTitle: 'HTML и CSS с нуля',
    examTitle: 'HTML және CSS негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'Параграф тегі қайсысы?',
        options: ['<p>Мәтін</p>', '<div>Мәтін</div>', '<span>Мәтін</span>', '<h1>Мәтін</h1>'],
        answer: '<p>Мәтін</p>',
      },
      {
        text: 'CSS-те элементке сыртқы шегіністі қалай береміз?',
        options: ['margin: 10px;', 'padding: 10px;', 'border: 10px;', 'spacing: 10px;'],
        answer: 'margin: 10px;',
      },
      {
        text: 'Flexbox-та horizontal ортаға қою үшін қандай қасиет қолданылады?',
        options: ['justify-content: center;', 'align-items: center;', 'text-align: center;', 'margin: auto;'],
        answer: 'justify-content: center;',
      },
      {
        text: 'HTML-де сілтеме (link) қалай жасалады?',
        options: ['<a href="url">Мәтін</a>', '<link href="url">Мәтін</link>', '<url>Мәтін</url>', '<src="url">Мәтін</src>'],
        answer: '<a href="url">Мәтін</a>',
      },
      {
        text: 'CSS Selector #header қайсы элементті таңдайды?',
        options: ['id="header" бар элемент', 'class="header" бар элемент', '<header> тегі', 'name="header" бар элемент'],
        answer: 'id="header" бар элемент',
      },
      {
        text: 'Суретті HTML-ге қосу тегі?',
        options: ['<img src="photo.jpg" alt="сурет">', '<image src="photo.jpg">', '<pic src="photo.jpg">', '<photo src="photo.jpg">'],
        answer: '<img src="photo.jpg" alt="сурет">',
      },
      {
        text: 'CSS Grid-та 3 бағанды тор қалай жасаймыз?',
        options: ['grid-template-columns: repeat(3, 1fr);', 'grid-columns: 3;', 'display: grid(3);', 'columns: 3 1fr;'],
        answer: 'grid-template-columns: repeat(3, 1fr);',
      },
      {
        text: 'HTML формасында деректерді серверге жіберу үшін қандай әдіс қолданылады?',
        options: ['<form method="post" action="/submit">', '<form send="post" target="/submit">', '<form type="post" url="/submit">', '<form post="/submit">'],
        answer: '<form method="post" action="/submit">',
      },
      {
        text: 'CSS-те элементті жасыру үшін қай қасиет қолданылады?',
        options: ['display: none;', 'visible: false;', 'hidden: true;', 'opacity: 0; visibility: hidden;'],
        answer: 'display: none;',
      },
      {
        text: 'HTML5-те семантикалық навигация тегі қайсысы?',
        options: ['<nav>', '<menu>', '<navigation>', '<header>'],
        answer: '<nav>',
      },
    ],
  },

  // ── JavaScript ──────────────────────────────────
  {
    courseTitle: 'JavaScript для начинающих',
    examTitle: 'JavaScript негіздері бойынша финалдық тест',
    duration: 35, passScore: 60,
    questions: [
      {
        text: 'Мына код нені шығарады?\n```js\nconsole.log(typeof null);\n```',
        options: ['"object"', '"null"', '"undefined"', '"boolean"'],
        answer: '"object"',
      },
      {
        text: 'JavaScript-те массив соңына элемент қосу методы?',
        options: ['arr.push("элемент")', 'arr.add("элемент")', 'arr.append("элемент")', 'arr.insert("элемент")'],
        answer: 'arr.push("элемент")',
      },
      {
        text: 'Мына код нені шығарады?\n```js\nconsole.log(1 + "2");\n```',
        options: ['"12"', '3', 'NaN', 'TypeError'],
        answer: '"12"',
      },
      {
        text: 'Стрелочная функция дұрыс жазылуы?',
        options: ['const add = (a, b) => a + b;', 'const add = a, b => a + b;', 'function add = (a, b) => a + b;', 'arrow add(a, b) { return a + b; }'],
        answer: 'const add = (a, b) => a + b;',
      },
      {
        text: 'DOM-да id="btn" элементін алу?',
        options: ['document.getElementById("btn")', 'document.getElement("btn")', 'document.find("#btn")', 'DOM.getElementById("btn")'],
        answer: 'document.getElementById("btn")',
      },
      {
        text: 'Мына цикл нешe рет орындалады?\n```js\nfor (let i = 0; i < 5; i++) {}\n```',
        options: ['5', '4', '6', '0'],
        answer: '5',
      },
      {
        text: '=== және == айырмашылығы қандай?',
        options: ['=== типті де тексереді, == тек мәнді', '== типті де тексереді, === тек мәнді', 'Айырмашылығы жоқ', '=== тек сандарға жұмыс істейді'],
        answer: '=== типті де тексереді, == тек мәнді',
      },
      {
        text: 'Массив элементтерін итерациялаудың қазіргі заманауи жолы?',
        options: ['arr.forEach(item => console.log(item))', 'for (i = 0; i < arr.length; i++)', 'arr.each(item => console.log(item))', 'foreach (item in arr)'],
        answer: 'arr.forEach(item => console.log(item))',
      },
      {
        text: 'Promise-ті дұрыс жасау?',
        options: [
          'new Promise((resolve, reject) => { resolve(42); })',
          'Promise.new((resolve) => { resolve(42); })',
          'async Promise(() => { return 42; })',
          'new Async((resolve) => { resolve(42); })',
        ],
        answer: 'new Promise((resolve, reject) => { resolve(42); })',
      },
      {
        text: 'localStorage-ке мән сақтау?',
        options: ['localStorage.setItem("key", "value")', 'localStorage.save("key", "value")', 'localStorage["key"] = "value"', 'localStorage.put("key", "value")'],
        answer: 'localStorage.setItem("key", "value")',
      },
    ],
  },

  // ── Python ──────────────────────────────────────
  {
    courseTitle: 'Python: первые шаги',
    examTitle: 'Python негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'Python-да список (лист) жасау?',
        options: ['my_list = [1, 2, 3]', 'my_list = (1, 2, 3)', 'my_list = {1, 2, 3}', 'my_list = array(1, 2, 3)'],
        answer: 'my_list = [1, 2, 3]',
      },
      {
        text: 'Мына код нені шығарады?\n```python\nprint(10 // 3)\n```',
        options: ['3', '3.33', '4', '1'],
        answer: '3',
      },
      {
        text: 'Python функциясы дұрыс жазылуы?',
        options: ['def greet(name):\n    return f"Hello {name}"', 'function greet(name):\n    return f"Hello {name}"', 'def greet(name) {\n    return f"Hello {name}"\n}', 'func greet(name):\n    return f"Hello {name}"'],
        answer: 'def greet(name):\n    return f"Hello {name}"',
      },
      {
        text: 'Python-да словарь (dict) мәнін алу?',
        options: ['d["key"]', 'd.get_value("key")', 'd->key', 'd.fetch("key")'],
        answer: 'd["key"]',
      },
      {
        text: 'List comprehension дұрыс синтаксисі?',
        options: ['squares = [x**2 for x in range(5)]', 'squares = (x**2 for x in range(5))', 'squares = {x**2 for x in range(5)}', 'squares = [x**2 | x in range(5)]'],
        answer: 'squares = [x**2 for x in range(5)]',
      },
      {
        text: 'Мына код нені шығарады?\n```python\nprint(bool(0))\n```',
        options: ['False', 'True', '0', 'None'],
        answer: 'False',
      },
      {
        text: 'Python-да try/except дұрыс жазылуы?',
        options: [
          'try:\n    x = 1/0\nexcept ZeroDivisionError:\n    print("Ошибка")',
          'try {\n    x = 1/0\n} catch(e) {\n    print("Ошибка")\n}',
          'try:\n    x = 1/0\ncatch Exception:\n    print("Ошибка")',
          'try:\n    x = 1/0\nfinally:\n    print("Ошибка")',
        ],
        answer: 'try:\n    x = 1/0\nexcept ZeroDivisionError:\n    print("Ошибка")',
      },
      {
        text: 'Python while цикл мысалы?',
        options: ['while x < 10:\n    x += 1', 'while (x < 10) {\n    x++\n}', 'loop while x < 10:\n    x += 1', 'do while x < 10:\n    x += 1'],
        answer: 'while x < 10:\n    x += 1',
      },
      {
        text: 'Python-да сыртқы кітапхананы импорттау?',
        options: ['import numpy as np', 'include numpy as np', 'require numpy as np', 'using numpy as np'],
        answer: 'import numpy as np',
      },
      {
        text: 'Python класс дұрыс жазылуы?',
        options: [
          'class Dog:\n    def __init__(self, name):\n        self.name = name',
          'class Dog {\n    def __init__(self, name):\n        self.name = name\n}',
          'object Dog:\n    def __init__(self, name):\n        self.name = name',
          'class Dog(name):\n    self.name = name',
        ],
        answer: 'class Dog:\n    def __init__(self, name):\n        self.name = name',
      },
    ],
  },

  // ── Git ─────────────────────────────────────────
  {
    courseTitle: 'Git и GitHub с нуля',
    examTitle: 'Git негіздері бойынша финалдық тест',
    duration: 25, passScore: 60,
    questions: [
      {
        text: 'Жаңа Git репозиторий бастау командасы?',
        options: ['git init', 'git start', 'git new', 'git create'],
        answer: 'git init',
      },
      {
        text: 'Барлық өзгерістерді staging area-ға қосу командасы?',
        options: ['git add .', 'git stage .', 'git commit .', 'git push .'],
        answer: 'git add .',
      },
      {
        text: 'Өзгерістерді сақтайтын (commit) команда?',
        options: ['git commit -m "хабарлама"', 'git save -m "хабарлама"', 'git add -m "хабарлама"', 'git push -m "хабарлама"'],
        answer: 'git commit -m "хабарлама"',
      },
      {
        text: 'Жаңа branch жасап, оған ауысу командасы?',
        options: ['git checkout -b feature/new', 'git branch -n feature/new', 'git new branch feature/new', 'git switch --create feature/new'],
        answer: 'git checkout -b feature/new',
      },
      {
        text: 'Remote репозиторийге push жасау командасы?',
        options: ['git push origin main', 'git upload origin main', 'git send origin main', 'git submit origin main'],
        answer: 'git push origin main',
      },
      {
        text: 'Remote repository-ді жергілікті компьютерге клондау командасы?',
        options: ['git clone https://github.com/user/repo.git', 'git copy https://github.com/user/repo.git', 'git download https://github.com/user/repo.git', 'git pull https://github.com/user/repo.git'],
        answer: 'git clone https://github.com/user/repo.git',
      },
      {
        text: 'Git commit тарихын көру командасы?',
        options: ['git log', 'git history', 'git show', 'git list'],
        answer: 'git log',
      },
      {
        text: 'Staging area-дан файлды алып тастау командасы?',
        options: ['git reset HEAD file.txt', 'git unstage file.txt', 'git remove file.txt', 'git unadd file.txt'],
        answer: 'git reset HEAD file.txt',
      },
      {
        text: 'Соңғы commitтің хабарламасын өзгерту командасы?',
        options: ['git commit --amend -m "жаңа хабарлама"', 'git commit --edit -m "жаңа хабарлама"', 'git commit --redo -m "жаңа хабарлама"', 'git update -m "жаңа хабарлама"'],
        answer: 'git commit --amend -m "жаңа хабарлама"',
      },
      {
        text: 'merge-конфликтті шешкен соң қандай команда орындаймыз?',
        options: ['git add . && git commit', 'git merge --resolve', 'git conflict fix', 'git push --force'],
        answer: 'git add . && git commit',
      },
    ],
  },

  // ── TypeScript ──────────────────────────────────
  {
    courseTitle: 'Основы TypeScript',
    examTitle: 'TypeScript негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'TypeScript-те функция параметрін типтеу?',
        options: ['function greet(name: string): string { return name; }', 'function greet(name as string): string { return name; }', 'function greet(string name): string { return name; }', 'function greet(name => string): string { return name; }'],
        answer: 'function greet(name: string): string { return name; }',
      },
      {
        text: 'Interface дұрыс анықтамасы?',
        options: ['interface User { name: string; age: number; }', 'type User = { name: string; age: number; }', 'interface User(name: string, age: number)', 'define interface User { name: string; age: number; }'],
        answer: 'interface User { name: string; age: number; }',
      },
      {
        text: 'Optional қасиет interface-те қалай белгіленеді?',
        options: ['interface User { email?: string; }', 'interface User { email: optional string; }', 'interface User { email: string | undefined; }', 'interface User { optional email: string; }'],
        answer: 'interface User { email?: string; }',
      },
      {
        text: 'Union type дұрыс жазылуы?',
        options: ['type Status = "active" | "inactive" | "banned";', 'type Status = "active" & "inactive" & "banned";', 'type Status = ("active", "inactive", "banned");', 'union Status = "active" | "inactive";'],
        answer: 'type Status = "active" | "inactive" | "banned";',
      },
      {
        text: 'Generic function дұрыс синтаксисі?',
        options: ['function identity<T>(arg: T): T { return arg; }', 'function identity(T)(arg: T): T { return arg; }', 'function identity[T](arg: T): T { return arg; }', 'generic function identity(arg): auto { return arg; }'],
        answer: 'function identity<T>(arg: T): T { return arg; }',
      },
      {
        text: 'TypeScript-те enum дұрыс анықтамасы?',
        options: ['enum Direction { Up, Down, Left, Right }', 'const enum Direction = { Up, Down, Left, Right }', 'type Direction = enum { Up, Down, Left, Right }', 'define enum Direction { Up = 0, Down = 1 }'],
        answer: 'enum Direction { Up, Down, Left, Right }',
      },
      {
        text: 'Readonly қасиет нені білдіреді?',
        options: [
          'interface Point { readonly x: number; } // x-ты өзгертуге болмайды',
          'interface Point { readonly x: number; } // x тек getter',
          'interface Point { const x: number; } // x константа',
          'interface Point { immutable x: number; } // x мутацияланбайды',
        ],
        answer: 'interface Point { readonly x: number; } // x-ты өзгертуге болмайды',
      },
      {
        text: 'Array типін TS-те қалай жариялаймыз?',
        options: ['const arr: number[] = [1, 2, 3];', 'const arr: Array[number] = [1, 2, 3];', 'const arr: list<number> = [1, 2, 3];', 'const arr = number[1, 2, 3];'],
        answer: 'const arr: number[] = [1, 2, 3];',
      },
      {
        text: 'Type assertion (тип айналдыру) дұрыс синтаксисі?',
        options: ['const len = (input as string).length;', 'const len = (string)input.length;', 'const len = input.cast<string>().length;', 'const len = convert<string>(input).length;'],
        answer: 'const len = (input as string).length;',
      },
      {
        text: 'tsconfig.json-де "strict" режимі нені қосады?',
        options: [
          'noImplicitAny, strictNullChecks, strictFunctionTypes т.б.',
          'Тек noImplicitAny режимін қосады',
          'Тек strictNullChecks режимін қосады',
          'TypeScript-ті тезірек компиляциялайды',
        ],
        answer: 'noImplicitAny, strictNullChecks, strictFunctionTypes т.б.',
      },
    ],
  },

  // ── React ───────────────────────────────────────
  {
    courseTitle: 'React.js — первое знакомство',
    examTitle: 'React.js негіздері бойынша финалдық тест',
    duration: 35, passScore: 60,
    questions: [
      {
        text: 'React компоненті ең қарапайым түрде қалай жазылады?',
        options: [
          'function Welcome() { return <h1>Сәлем</h1>; }',
          'component Welcome() { return <h1>Сәлем</h1>; }',
          'class Welcome { render() { return <h1>Сәлем</h1>; } }',
          'const Welcome = () => { html: <h1>Сәлем</h1> };',
        ],
        answer: 'function Welcome() { return <h1>Сәлем</h1>; }',
      },
      {
        text: 'useState хукын дұрыс қолдану?',
        options: [
          'const [count, setCount] = useState(0);',
          'const count = useState(0);',
          'let [count, setCount] = new useState(0);',
          'const count = useStateValue(0);',
        ],
        answer: 'const [count, setCount] = useState(0);',
      },
      {
        text: 'Props-ты компонентке беру дұрыс синтаксисі?',
        options: [
          '<Button text="Басу" onClick={handleClick} />',
          '<Button text="Басу" onClick="handleClick" />',
          '<Button text="Басу", onClick={handleClick} />',
          '<Button props={{ text: "Басу", onClick: handleClick }} />',
        ],
        answer: '<Button text="Басу" onClick={handleClick} />',
      },
      {
        text: 'useEffect — компонент mount болғанда бір рет орындау?',
        options: [
          'useEffect(() => { fetchData(); }, []);',
          'useEffect(() => { fetchData(); });',
          'useEffect(fetchData, [once: true]);',
          'onMount(() => { fetchData(); });',
        ],
        answer: 'useEffect(() => { fetchData(); }, []);',
      },
      {
        text: 'Жиым (массив) элементтерін render жасау?',
        options: [
          'items.map(item => <li key={item.id}>{item.name}</li>)',
          'items.forEach(item => <li>{item.name}</li>)',
          'for (item of items) { <li>{item.name}</li> }',
          'items.render(item => <li>{item.name}</li>)',
        ],
        answer: 'items.map(item => <li key={item.id}>{item.name}</li>)',
      },
      {
        text: 'Шартты рендеринг (conditional rendering) дұрыс синтаксисі?',
        options: [
          '{isLoggedIn && <Dashboard />}',
          '{if (isLoggedIn) <Dashboard />}',
          '{isLoggedIn ? render(<Dashboard />) : null}',
          '<render if={isLoggedIn}><Dashboard /></render>',
        ],
        answer: '{isLoggedIn && <Dashboard />}',
      },
      {
        text: 'useCallback хуки не үшін қолданылады?',
        options: [
          'Функцияны мемоизациялау (қайта жасалудан сақтау)',
          'Async функцияларды жасау',
          'Event handler-лерді синхронды ету',
          'Компонент lifecycle-ын басқару',
        ],
        answer: 'Функцияны мемоизациялау (қайта жасалудан сақтау)',
      },
      {
        text: 'React.memo() не жасайды?',
        options: [
          'Props өзгермесе компонентті қайта render жасамайды',
          'Компонентті сервер жағында рендерлейді',
          'Компонентті кэштейді',
          'useEffect-ті жылдамдатады',
        ],
        answer: 'Props өзгермесе компонентті қайта render жасамайды',
      },
      {
        text: 'Context API қолдану — контекст жасау?',
        options: [
          'const ThemeContext = React.createContext("light");',
          'const ThemeContext = new React.Context("light");',
          'const ThemeContext = React.makeContext("light");',
          'const ThemeContext = createStore("light");',
        ],
        answer: 'const ThemeContext = React.createContext("light");',
      },
      {
        text: 'Input-та onChange handler дұрыс жазылуы?',
        options: [
          '<input value={text} onChange={e => setText(e.target.value)} />',
          '<input value={text} onChange={setText(e.target.value)} />',
          '<input value={text} onchange={e => setText(e.target.value)} />',
          '<input value={text} onChange={setText} />',
        ],
        answer: '<input value={text} onChange={e => setText(e.target.value)} />',
      },
    ],
  },

  // ── SQL ─────────────────────────────────────────
  {
    courseTitle: 'Основы SQL',
    examTitle: 'SQL негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'Кесте (таблица) дұрыс жасау SQL командасы?',
        options: [
          'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));',
          'NEW TABLE users (id INT PRIMARY KEY, name VARCHAR(100));',
          'MAKE TABLE users (id INT, name VARCHAR(100));',
          'CREATE users TABLE (id INT PRIMARY KEY, name VARCHAR(100));',
        ],
        answer: 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));',
      },
      {
        text: 'Барлық пайдаланушыларды алу SQL сұранысы?',
        options: ['SELECT * FROM users;', 'GET * FROM users;', 'FETCH ALL FROM users;', 'SELECT users FROM *;'],
        answer: 'SELECT * FROM users;',
      },
      {
        text: 'Жаңа жазба қосу SQL командасы?',
        options: [
          "INSERT INTO users (name, email) VALUES ('Алибек', 'ali@test.kz');",
          "ADD INTO users (name, email) VALUES ('Алибек', 'ali@test.kz');",
          "INSERT users (name, email) VALUES ('Алибек', 'ali@test.kz');",
          "NEW INTO users VALUES ('Алибек', 'ali@test.kz');",
        ],
        answer: "INSERT INTO users (name, email) VALUES ('Алибек', 'ali@test.kz');",
      },
      {
        text: 'Шартпен деректерді сүзу (фильтрлау)?',
        options: [
          "SELECT * FROM users WHERE age > 18;",
          "SELECT * FROM users IF age > 18;",
          "SELECT * FROM users FILTER age > 18;",
          "SELECT * FROM users HAVING age > 18;",
        ],
        answer: "SELECT * FROM users WHERE age > 18;",
      },
      {
        text: 'Жазбаны жаңарту SQL командасы?',
        options: [
          "UPDATE users SET name = 'Жаңа аты' WHERE id = 1;",
          "CHANGE users SET name = 'Жаңа аты' WHERE id = 1;",
          "MODIFY users name = 'Жаңа аты' WHERE id = 1;",
          "ALTER users SET name = 'Жаңа аты' WHERE id = 1;",
        ],
        answer: "UPDATE users SET name = 'Жаңа аты' WHERE id = 1;",
      },
      {
        text: 'Екі кестені бірлестіру (JOIN)?',
        options: [
          'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id;',
          'SELECT u.name, o.total FROM users u MERGE orders o ON u.id = o.user_id;',
          'SELECT u.name, o.total FROM users u COMBINE orders o ON u.id = o.user_id;',
          'SELECT u.name, o.total FROM users u, orders o WHERE u.id = o.user_id;',
        ],
        answer: 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id;',
      },
      {
        text: 'Жазбалар санын есептеу?',
        options: [
          'SELECT COUNT(*) FROM orders;',
          'SELECT LEN(*) FROM orders;',
          'SELECT TOTAL(*) FROM orders;',
          'SELECT NUM(*) FROM orders;',
        ],
        answer: 'SELECT COUNT(*) FROM orders;',
      },
      {
        text: 'Топтастыру (GROUP BY) дұрыс мысалы?',
        options: [
          'SELECT city, COUNT(*) FROM users GROUP BY city;',
          'SELECT city, COUNT(*) FROM users SORT BY city;',
          'SELECT city, COUNT(*) FROM users ORDER city;',
          'SELECT city, COUNT(*) FROM users PARTITION BY city;',
        ],
        answer: 'SELECT city, COUNT(*) FROM users GROUP BY city;',
      },
      {
        text: 'Жазбаны жою SQL командасы?',
        options: [
          'DELETE FROM users WHERE id = 5;',
          'REMOVE FROM users WHERE id = 5;',
          'DROP FROM users WHERE id = 5;',
          'ERASE FROM users WHERE id = 5;',
        ],
        answer: 'DELETE FROM users WHERE id = 5;',
      },
      {
        text: 'Нәтижелерді сұрыптау (сортировка)?',
        options: [
          'SELECT * FROM users ORDER BY name ASC;',
          'SELECT * FROM users SORT BY name ASC;',
          'SELECT * FROM users ARRANGE BY name ASC;',
          'SELECT * FROM users ORDERBY name ASC;',
        ],
        answer: 'SELECT * FROM users ORDER BY name ASC;',
      },
    ],
  },

  // ── Node.js ─────────────────────────────────────
  {
    courseTitle: 'Node.js для начинающих',
    examTitle: 'Node.js негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'Node.js-те HTTP сервер жасау?',
        options: [
          "const http = require('http');\nhttp.createServer((req, res) => res.end('OK')).listen(3000);",
          "import server from 'http';\nserver.start(3000);",
          "const server = new HTTPServer(3000);\nserver.listen();",
          "http.listen(3000, (req, res) => res.send('OK'));",
        ],
        answer: "const http = require('http');\nhttp.createServer((req, res) => res.end('OK')).listen(3000);",
      },
      {
        text: 'package.json-де npm script қосу?',
        options: [
          '"scripts": { "start": "node index.js" }',
          '"run": { "start": "node index.js" }',
          '"commands": { "start": "node index.js" }',
          '"tasks": { "start": "node index.js" }',
        ],
        answer: '"scripts": { "start": "node index.js" }',
      },
      {
        text: 'Файлды асинхронды оқу (fs модулі)?',
        options: [
          "const fs = require('fs');\nfs.readFile('file.txt', 'utf8', (err, data) => console.log(data));",
          "import { readFile } from 'file';\nreadFile('file.txt').then(data => console.log(data));",
          "const file = open('file.txt');\nconsole.log(file.read());",
          "Node.fs.read('file.txt', data => console.log(data));",
        ],
        answer: "const fs = require('fs');\nfs.readFile('file.txt', 'utf8', (err, data) => console.log(data));",
      },
      {
        text: 'Express.js-те GET маршруты (route) жасау?',
        options: [
          "app.get('/users', (req, res) => res.json(users));",
          "app.route('/users', 'GET', (req, res) => res.json(users));",
          "router.GET('/users', (req, res) => res.json(users));",
          "app.handle('GET /users', (req, res) => res.json(users));",
        ],
        answer: "app.get('/users', (req, res) => res.json(users));",
      },
      {
        text: 'Environment variable алу?',
        options: [
          "process.env.PORT",
          "env.get('PORT')",
          "system.getenv('PORT')",
          "Node.env('PORT')",
        ],
        answer: "process.env.PORT",
      },
      {
        text: 'npm пакетін орнату командасы?',
        options: [
          'npm install express',
          'npm add express',
          'npm get express',
          'node install express',
        ],
        answer: 'npm install express',
      },
      {
        text: 'Async/await функция дұрыс жазылуы?',
        options: [
          'async function getData() { const data = await fetchAPI(); return data; }',
          'function async getData() { const data = await fetchAPI(); return data; }',
          'async getData() { const data = await fetchAPI(); return data; }',
          'function getData() { async const data = await fetchAPI(); return data; }',
        ],
        answer: 'async function getData() { const data = await fetchAPI(); return data; }',
      },
      {
        text: 'Express middleware қосу?',
        options: [
          "app.use(express.json());",
          "app.middleware(express.json());",
          "app.plug(express.json());",
          "app.add(express.json());",
        ],
        answer: "app.use(express.json());",
      },
      {
        text: "require() мен import-тың айырмашылығы?",
        options: [
          "require() — CommonJS (Node.js), import — ES Modules (браузер/заманауи)",
          "require() — браузер үшін, import — Node.js үшін",
          "require() тек синхронды, import тек асинхронды",
          "Айырмашылығы жоқ, екеуі де бірдей жұмыс істейді",
        ],
        answer: "require() — CommonJS (Node.js), import — ES Modules (браузер/заманауи)",
      },
      {
        text: '__dirname мен __filename не береді?',
        options: [
          '__dirname — ағымдағы папка жолы, __filename — ағымдағы файл жолы',
          '__dirname — файл атауы, __filename — толық жол',
          '__dirname — жобаның root-ы, __filename — нақты файл',
          'Екеуі де бірдей, процесс жолын береді',
        ],
        answer: '__dirname — ағымдағы папка жолы, __filename — ағымдағы файл жолы',
      },
    ],
  },

  // ── Docker ──────────────────────────────────────
  {
    courseTitle: 'Docker для разработчиков',
    examTitle: 'Docker негіздері бойынша финалдық тест',
    duration: 30, passScore: 60,
    questions: [
      {
        text: 'Node.js қолданбасының дұрыс Dockerfile?',
        options: [
          'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nCMD ["node", "index.js"]',
          'FROM node:20\nRUN npm install\nCOPY . /app\nSTART node index.js',
          'BASE node:20-alpine\nDIR /app\nINSTALL npm\nRUN node index.js',
          'FROM node\nCOPY . .\nRUN npm start',
        ],
        answer: 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nCMD ["node", "index.js"]',
      },
      {
        text: 'Docker image жасау командасы?',
        options: [
          'docker build -t myapp:latest .',
          'docker create -t myapp:latest .',
          'docker make -t myapp:latest .',
          'docker image new myapp:latest',
        ],
        answer: 'docker build -t myapp:latest .',
      },
      {
        text: 'Docker контейнерін іске қосу (порт пен фондық режим)?',
        options: [
          'docker run -d -p 3000:3000 myapp:latest',
          'docker start -bg -port 3000:3000 myapp:latest',
          'docker run --background --port=3000 myapp:latest',
          'docker launch -d -p 3000 myapp:latest',
        ],
        answer: 'docker run -d -p 3000:3000 myapp:latest',
      },
      {
        text: 'Іске қосылған контейнерлерді көру командасы?',
        options: ['docker ps', 'docker list', 'docker show', 'docker status'],
        answer: 'docker ps',
      },
      {
        text: 'docker-compose.yml-де сервис анықтамасы?',
        options: [
          'services:\n  web:\n    build: .\n    ports:\n      - "3000:3000"',
          'containers:\n  web:\n    dockerfile: .\n    port: "3000:3000"',
          'services:\n  web:\n    image: .\n    expose: "3000:3000"',
          'apps:\n  web:\n    build: .\n    network: "3000:3000"',
        ],
        answer: 'services:\n  web:\n    build: .\n    ports:\n      - "3000:3000"',
      },
      {
        text: 'Docker volume жасау және контейнерге байлау?',
        options: [
          'docker run -v myvolume:/app/data myapp',
          'docker run --storage myvolume:/app/data myapp',
          'docker run -mount myvolume:/app/data myapp',
          'docker run --disk myvolume:/app/data myapp',
        ],
        answer: 'docker run -v myvolume:/app/data myapp',
      },
      {
        text: 'Контейнер ішіне кіру (bash)?',
        options: [
          'docker exec -it container_name bash',
          'docker enter -it container_name',
          'docker ssh container_name',
          'docker attach --bash container_name',
        ],
        answer: 'docker exec -it container_name bash',
      },
      {
        text: '.dockerignore файлы не үшін қолданылады?',
        options: [
          'Build контекстіне қосылмауы тиіс файлдарды көрсету',
          'Docker image-де жасырын файлдарды анықтау',
          'Контейнер ішінде рұқсатты шектеу',
          'Docker registry кіру тіркелгілерін сақтау',
        ],
        answer: 'Build контекстіне қосылмауы тиіс файлдарды көрсету',
      },
      {
        text: 'Multi-stage build не береді?',
        options: [
          'Соңғы image кішірейеді (build артефактілері алынып тасталады)',
          'Бірнеше OS-та бір уақытта build жасайды',
          'Image-ді тезірек жасайды',
          'Бірнеше Dockerfile-ды біріктіреді',
        ],
        answer: 'Соңғы image кішірейеді (build артефактілері алынып тасталады)',
      },
      {
        text: 'Docker network туралы дұрыс тұжырым?',
        options: [
          'Бір желіде (network) тұрған контейнерлер бір-бірімен атаулары арқылы сөйлеседі',
          'Контейнерлер тек IP арқылы ғана сөйлесе алады',
          'Docker желісі тек host желісімен жұмыс істейді',
          'Бір желіде тұрған контейнерлер автоматты токен алмасады',
        ],
        answer: 'Бір желіде (network) тұрған контейнерлер бір-бірімен атаулары арқылы сөйлеседі',
      },
    ],
  },

  // ── NestJS ──────────────────────────────────────
  {
    courseTitle: 'NestJS: бэкенд на TypeScript',
    examTitle: 'NestJS негіздері бойынша финалдық тест',
    duration: 40, passScore: 65,
    questions: [
      {
        text: 'NestJS контроллер дұрыс декораторы?',
        options: [
          "@Controller('users')\nexport class UsersController {}",
          "@Route('users')\nexport class UsersController {}",
          "@Api('/users')\nexport class UsersController {}",
          "@Handler('users')\nexport class UsersController {}",
        ],
        answer: "@Controller('users')\nexport class UsersController {}",
      },
      {
        text: 'GET сұранысын өңдейтін handler дұрыс жазылуы?',
        options: [
          "@Get()\nfindAll(): User[] { return this.usersService.findAll(); }",
          "@GetRequest()\nfindAll(): User[] { return this.usersService.findAll(); }",
          "@HttpGet()\nfindAll(): User[] { return this.usersService.findAll(); }",
          "@Get\nfindAll(): User[] { return this.usersService.findAll(); }",
        ],
        answer: "@Get()\nfindAll(): User[] { return this.usersService.findAll(); }",
      },
      {
        text: 'NestJS сервисін модульге тіркеу?',
        options: [
          '@Module({ providers: [UsersService], controllers: [UsersController] })',
          '@Module({ services: [UsersService], routes: [UsersController] })',
          '@Module({ inject: [UsersService], handle: [UsersController] })',
          '@Module({ register: [UsersService], bind: [UsersController] })',
        ],
        answer: '@Module({ providers: [UsersService], controllers: [UsersController] })',
      },
      {
        text: 'DTO (Data Transfer Object) дұрыс анықтамасы?',
        options: [
          "export class CreateUserDto {\n  @IsString()\n  name: string;\n}",
          "export interface CreateUserDto {\n  name: string;\n}",
          "export const CreateUserDto = { name: string };",
          "@DTO()\nexport class CreateUserDto { name: string; }",
        ],
        answer: "export class CreateUserDto {\n  @IsString()\n  name: string;\n}",
      },
      {
        text: 'Prisma сервисін NestJS-те пайдалану?',
        options: [
          'constructor(private prisma: PrismaService) {}\nasync findAll() { return this.prisma.user.findMany(); }',
          'const prisma = new PrismaClient();\nasync findAll() { return prisma.user.findMany(); }',
          'inject(PrismaService);\nasync findAll() { return prisma.user.findMany(); }',
          '@Inject(PrismaService)\nasync findAll() { return this.db.user.findMany(); }',
        ],
        answer: 'constructor(private prisma: PrismaService) {}\nasync findAll() { return this.prisma.user.findMany(); }',
      },
      {
        text: 'JWT Guard-ты қолдану?',
        options: [
          "@UseGuards(JwtAuthGuard)\n@Get('profile')\ngetProfile() {}",
          "@Guard(JwtAuthGuard)\n@Get('profile')\ngetProfile() {}",
          "@Auth(JWT)\n@Get('profile')\ngetProfile() {}",
          "@Protect(JwtAuthGuard)\n@Get('profile')\ngetProfile() {}",
        ],
        answer: "@UseGuards(JwtAuthGuard)\n@Get('profile')\ngetProfile() {}",
      },
      {
        text: 'Route параметрін алу?',
        options: [
          "@Get(':id')\nfindById(@Param('id') id: string) {}",
          "@Get('/:id')\nfindById(@PathParam('id') id: string) {}",
          "@Get(':id')\nfindById(@RouteParam('id') id: string) {}",
          "@Get(':id')\nfindById(params: Params) { params.id }",
        ],
        answer: "@Get(':id')\nfindById(@Param('id') id: string) {}",
      },
      {
        text: 'ValidationPipe глобалды қосу?',
        options: [
          "app.useGlobalPipes(new ValidationPipe({ whitelist: true }));",
          "app.addPipe(new ValidationPipe({ whitelist: true }));",
          "app.setValidation(new ValidationPipe());",
          "app.configure(pipe => pipe.useValidation());",
        ],
        answer: "app.useGlobalPipes(new ValidationPipe({ whitelist: true }));",
      },
      {
        text: 'ConfigService арқылы environment variable алу?',
        options: [
          "this.configService.get<string>('DATABASE_URL')",
          "process.env.DATABASE_URL",
          "this.config.get('DATABASE_URL')",
          "ConfigModule.get('DATABASE_URL')",
        ],
        answer: "this.configService.get<string>('DATABASE_URL')",
      },
      {
        text: 'NotFoundException лакырту?',
        options: [
          "throw new NotFoundException('Пайдаланушы табылмады');",
          "throw new Error(404, 'Пайдаланушы табылмады');",
          "res.status(404).json({ message: 'Пайдаланушы табылмады' });",
          "return HttpException.notFound('Пайдаланушы табылмады');",
        ],
        answer: "throw new NotFoundException('Пайдаланушы табылмады');",
      },
    ],
  },

  // ── React Advanced ──────────────────────────────
  {
    courseTitle: 'React Advanced: хуки и паттерны',
    examTitle: 'React Advanced бойынша финалдық тест',
    duration: 40, passScore: 65,
    questions: [
      {
        text: 'useReducer хукін дұрыс қолдану?',
        options: [
          'const [state, dispatch] = useReducer(reducer, initialState);',
          'const [state, setState] = useReducer(initialState, reducer);',
          'const state = useReducer(reducer, initialState);',
          'const [state, action] = useReducer(reducer, {});',
        ],
        answer: 'const [state, dispatch] = useReducer(reducer, initialState);',
      },
      {
        text: 'Custom hook жасаудың негізгі ережесі?',
        options: [
          'Функция аты "use" деп басталуы тиіс: function useCustomHook()',
          'Функция хукті class ішінде анықтайды',
          '"hook" деп белгіленуі тиіс: @hook function customHook()',
          'Кез келген функция жарамды, арнайы атаусыз',
        ],
        answer: 'Функция аты "use" деп басталуы тиіс: function useCustomHook()',
      },
      {
        text: 'useMemo хуки не жасайды?',
        options: [
          'Есептеу нәтижесін dependency өзгергенде ғана қайта есептейді',
          'Функцияны мемоизациялайды',
          'Компонентті қайта render жасамайды',
          'State мәнін кэштейді',
        ],
        answer: 'Есептеу нәтижесін dependency өзгергенде ғана қайта есептейді',
      },
      {
        text: 'useRef хукінің негізгі қолданысы?',
        options: [
          'DOM элементіне тікелей қол жеткізу және render жасамай мән сақтау',
          'Global state сақтау',
          'Async сұраныстарды басқару',
          'Context мәнін алу',
        ],
        answer: 'DOM элементіне тікелей қол жеткізу және render жасамай мән сақтау',
      },
      {
        text: 'Render props паттерні дұрыс мысалы?',
        options: [
          '<DataFetcher render={data => <UserList users={data} />} />',
          '<DataFetcher component={UserList} />',
          '<DataFetcher>{data => <UserList users={data} />}</DataFetcher>',
          'Екеуі де дұрыс: render props және children функция',
        ],
        answer: 'Екеуі де дұрыс: render props және children функция',
      },
      {
        text: 'Compound Components паттерні дегеніміз не?',
        options: [
          'Бір компонент бірнеше ішкі компоненттен тұрады: <Select><Option/></Select>',
          'Бірнеше компоненттен жаңа компонент жасау',
          'HOC паттернімен компонентті орау',
          'Компоненттерді lazy load жасау',
        ],
        answer: 'Бір компонент бірнеше ішкі компоненттен тұрады: <Select><Option/></Select>',
      },
      {
        text: 'Code splitting React.lazy() дұрыс қолданылуы?',
        options: [
          "const LazyComponent = React.lazy(() => import('./Component'));\n<Suspense fallback={<Loader/>}><LazyComponent/></Suspense>",
          "const LazyComponent = lazy('./Component');\n<LazyComponent />",
          "import('./Component').then(C => <C />)",
          "React.import('./Component').render()",
        ],
        answer: "const LazyComponent = React.lazy(() => import('./Component'));\n<Suspense fallback={<Loader/>}><LazyComponent/>",
      },
      {
        text: 'useContext дұрыс қолданусы?',
        options: [
          'const theme = useContext(ThemeContext);',
          'const theme = React.getContext(ThemeContext);',
          'const theme = ThemeContext.useValue();',
          'const { theme } = useContext();',
        ],
        answer: 'const theme = useContext(ThemeContext);',
      },
      {
        text: 'Error Boundary не жасайды?',
        options: [
          'Ұрпақ компоненттердегі JavaScript қателерін ұстайды және fallback UI көрсетеді',
          'Async хатаны ұстайды',
          'try/catch блогін автоматты ауыстырады',
          'TypeScript compile time қателерін жасырады',
        ],
        answer: 'Ұрпақ компоненттердегі JavaScript қателерін ұстайды және fallback UI көрсетеді',
      },
      {
        text: 'useImperativeHandle хукін не үшін қолданады?',
        options: [
          'forwardRef-пен бірге ref арқылы ашылатын функцияларды баптау',
          'Parent компоненттен child-ты тікелей басқару',
          'Global event-тарды ұстау',
          'Component-тings lifecycle-ын басқару',
        ],
        answer: 'forwardRef-пен бірге ref арқылы ашылатын функцияларды баптау',
      },
    ],
  },
];

async function main() {
  console.log('Seeding exams with code questions...\n');

  const teacher = await prisma.user.findFirst({ where: { role: 'TEACHER' } });
  if (!teacher) {
    throw new Error('Teacher not found');
  }

  let created = 0;
  let skipped = 0;

  for (const examDef of examsData) {
    // Find the course
    const course = await prisma.course.findFirst({ where: { title: examDef.courseTitle } });
    if (!course) {
      console.log(`⚠️  Course not found: ${examDef.courseTitle}`);
      skipped++;
      continue;
    }

    // Check if exam already exists
    const existingExam = await prisma.exam.findFirst({
      where: { courseId: course.id, title: examDef.examTitle },
    });
    if (existingExam) {
      console.log(`⏭️  Skipped (exists): ${examDef.examTitle}`);
      skipped++;
      continue;
    }

    // Create exam with questions
    const exam = await prisma.exam.create({
      data: {
        courseId: course.id,
        title: examDef.examTitle,
        duration: examDef.duration,
        passScore: examDef.passScore,
        questions: {
          create: examDef.questions.map(q => ({
            text: q.text,
            type: QuestionType.SINGLE_CHOICE,
            options: q.options,
            answer: q.answer,
          })),
        },
      },
    });

    console.log(`✅ Created exam: ${exam.title} (${examDef.questions.length} questions)`);
    created++;
  }

  console.log(`\n✅ Done! Created: ${created}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
