#!/usr/bin/env python3
"""
ProctoLearn — обогащение уроков:
  - уроки 1-4 каждого модуля: богатый markdown контент + задание свободного типа
  - урок 5 каждого модуля (order % 5 == 0): мини-тест с keyword-проверкой
"""
import subprocess, tempfile, os
from datetime import datetime, UTC

DB = "proctolearn_db"
USER = "proctolearn"
CONTAINER = "proctolearn_postgres"

def psql(sql):
    r = subprocess.run(["docker","exec",CONTAINER,"psql","-U",USER,"-d",DB,"-t","-A","-F","\t","-c",sql], capture_output=True, text=True)
    return r.stdout.strip()

def run_sql_file(sql_content):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write("BEGIN;\n" + sql_content + "\nCOMMIT;\n")
        tmp = f.name
    subprocess.run(["docker","cp", tmp, f"{CONTAINER}:/tmp/enrich.sql"], capture_output=True)
    r = subprocess.run(["docker","exec",CONTAINER,"psql","-U",USER,"-d",DB,"-f","/tmp/enrich.sql"], capture_output=True, text=True)
    os.unlink(tmp)
    return r.returncode == 0

def esc(s):
    return s.replace("'","''")

def now():
    return datetime.now(UTC).strftime("%Y-%m-%d %T.000")

# ── Богатый контент по позиции урока в модуле ───────────────────────────────
def make_content(course_title, module_title, lesson_title, lesson_pos, level):
    """lesson_pos: 1-5 (позиция внутри модуля)"""
    difficulty = {"BEGINNER": "базалық", "INTERMEDIATE": "орта", "ADVANCED": "жоғары"}.get(level, "базалық")

    if lesson_pos == 1:
        return f"""## 📚 {lesson_title}

### 🎯 Сабақтың мақсаты
**{course_title}** курсының **{module_title}** модулінде сіз осы сабақ арқылы негізгі ұғымдарды меңгересіз.

---

### 📖 Теориялық негіз

**{lesson_title}** — бұл {difficulty} деңгейдегі маңызды тақырып. Оны түсіну үшін келесі ұғымдарды білу керек:

**Негізгі анықтамалар:**
- **Бірінші ұғым** — жүйенің немесе технологияның іргетасы болып табылады
- **Екінші ұғым** — практикалық қолданыста ең жиі кездесетін концепция
- **Үшінші ұғым** — жоғары деңгейге өту үшін міндетті білім

**Неліктен бұл маңызды?**

Қазіргі заманғы технологиялар осы принциптерге негізделген. Компаниялар бұл білімді бағалайды, себебі:
1. Өнімділікті арттырады
2. Жүйе сенімділігін қамтамасыз етеді
3. Ынтымақтастықты жеңілдетеді

---

### 💡 Практикалық мысал

```bash
# Нақты мысал: {course_title}
# Бұл команда немесе код {lesson_title.lower()} принципін көрсетеді
$ example-command --option value
> Нәтиже: success ✓
```

> **💡 Кеңес:** Материалды рет-ретімен оқыңыз. Әр тұжырымды жазып алыңыз — бұл есте сақтауға көмектеседі.

---

### 🔑 Осы сабақтың кілт ұғымдары

| Ұғым | Анықтама |
|------|----------|
| Негізгі термин | Технологияның бастапқы нүктесі |
| Жұмыс принципі | Жүйе қалай жұмыс істейтіні |
| Қолдану аясы | Қай жерде қолданылады |

---

### ✅ Өзіңізді тексеріңіз
Бұл сабақты аяқтамас бұрын өзіңізден сұраңыз:
- Негізгі анықтаманы өз сөзіңізбен айта аласыз ба?
- Практикалық мысал келтіре аласыз ба?
- Келесі сабаққа дайынсыз ба?
"""

    elif lesson_pos == 2:
        return f"""## 🔍 {lesson_title}

### 📌 Алдыңғы сабақты еске алу
**{module_title}** модулінің бірінші сабағында біз негізгі ұғымдармен танысқан болатынбыз. Енді тереңірек кірейік.

---

### 🧠 Тереңдетілген теория

**{lesson_title}** тақырыбы {course_title} курсында маңызды орын алады.

**Толық түсіну үшін:**

1. **Бірінші принцип** — Жүйенің компоненттері бір-бірімен қалай байланысады
   - Alt нұсқа А: өнімділік жоғары
   - Alt нұсқа Б: икемділік артады

2. **Екінші принцип** — Деректер ағыны қалай басқарылады
   - Синхронды: бірізді орындалу
   - Асинхронды: параллель орындалу

3. **Үшінші принцип** — Қауіпсіздік пен сенімділік қамтамасыз ету

---

### 💻 Код мысалы

```javascript
// {course_title}: {lesson_title}
function demonstrateConceptSimple(input) {{
  const step1 = processInput(input);      // Бірінші қадам
  const step2 = applyLogic(step1);        // Екінші қадам
  const result = validateOutput(step2);   // Нәтиже тексеру
  return result;
}}

// Тест
console.log(demonstrateConceptSimple("test")); // ✓ Expected: "success"
```

---

### 📊 Салыстырмалы кесте

| Тәсіл | Артықшылығы | Кемшілігі |
|-------|-------------|-----------|
| Классикалық | Қарапайым, анық | Баяурақ |
| Заманауи | Жылдам, икемді | Күрделірек |
| Гибридті | Баланс | Орта |

---

### 🎯 Практикалық тапсырма
Жоғарыдағы мысалды өз компьютеріңізде іске асырып көріңіз. Нәтижені байқап, ескертпелер жазыңыз.
"""

    elif lesson_pos == 3:
        return f"""## ⚙️ {lesson_title}

### 🔄 Модульдің ортасы: практика уақыты

Сіз **{module_title}** модулінің жартысына жеттіңіз! Енді білімді практикада қолдану кезі.

---

### 🛠️ Практикалық гайд

#### Қадам 1: Орта дайындау
```bash
# 1. Жобаны клондаңыз немесе файл жасаңыз
$ mkdir my-project && cd my-project

# 2. Қажетті тәуелділіктерді орнатыңыз
$ npm install   # немесе pip install -r requirements.txt

# 3. Конфигурацияны тексеріңіз
$ npm run check  # барлығы OK болуы керек
```

#### Қадам 2: Негізгі функционалды іске асыру
```python
# {course_title} практикалық мысалы
class Solution:
    def __init__(self):
        self.data = []

    def process(self, input_data: str) -> dict:
        # Деректерді өңдеу
        result = {{
            "status": "success",
            "input": input_data,
            "output": self._transform(input_data),
            "timestamp": "2026-04-24"
        }}
        return result

    def _transform(self, data: str) -> str:
        return data.upper()  # Мысал трансформация

# Тест
sol = Solution()
print(sol.process("hello"))  # {{"status": "success", ...}}
```

#### Қадам 3: Нәтижені тексеру

Орындалған код нәтижесін тексеріңіз:
- ✅ Күтілетін шығыс алды ма?
- ✅ Қателер жоқ па?
- ✅ Уақыт лимиті орындалды ма?

---

### 🐛 Жиі кездесетін қателер

| Қате | Себеп | Шешім |
|------|-------|-------|
| NullPointerException | Бос мән | `null` тексеруді қосу |
| Timeout | Баяу алгоритм | Оңтайлыдыру |
| PermissionDenied | Рұқсат жоқ | Рұқсаттарды тексеру |

---

### 📝 Осы сабақтан алынған сабақ
> "{course_title} саласында сенімді болу үшін тәжірибе ең маңызды фактор."

**Күнделікті жаттығу:** 20-30 минут практика — кәсіби дамудың кілті.
"""

    elif lesson_pos == 4:
        return f"""## 🚀 {lesson_title}

### 🎓 Модуль аяқталмас бұрын: жетілдіру

**{module_title}** модулін аяқтауға аз қалды. Бұл сабақта күрделірек аспектілерді қарастырамыз.

---

### 🔥 Жетілдірілген концепциялар

#### Паттерн 1: Оңтайлы шешім
Жай шешімнің орнына оңтайлы шешімді қалай жазу керек?

```typescript
// ❌ Жай (баяу) нұсқа
function slowVersion(items: string[]): string[] {{
  const result = [];
  for (let i = 0; i < items.length; i++) {{
    for (let j = 0; j < items.length; j++) {{
      if (items[i] !== items[j]) result.push(items[i]);
    }}
  }}
  return result; // O(n²) — баяу
}}

// ✅ Оңтайлы нұсқа
function fastVersion(items: string[]): string[] {{
  const seen = new Set<string>();
  return items.filter(item => !seen.has(item) && seen.add(item));
}} // O(n) — жылдам
```

#### Паттерн 2: Қате өңдеу
```typescript
async function robustOperation(input: string): Promise<Result> {{
  try {{
    const validated = await validate(input);
    const processed = await process(validated);
    return {{ success: true, data: processed }};
  }} catch (error) {{
    if (error instanceof ValidationError) {{
      return {{ success: false, error: 'Деректер дұрыс емес' }};
    }}
    throw error; // Күтпеген қате — жоғары тастайды
  }}
}}
```

---

### 📈 Нақты жағдайда қолдану

**{course_title}** саласындағы нақты компаниялар осы принциптерді қалай пайдаланады:

1. **Netflix** — микросервис архитектурасы
2. **Airbnb** — деректер пайдаланушы тәжірибесі
3. **Uber** — реалтайм жүйелер

---

### 🏆 Биіктікке шығу

{difficulty.capitalize()} деңгейдегі маман болу үшін:
- [ ] Теорияны толық түсіну
- [ ] Кем дегенде 3 практикалық жоба
- [ ] Open source жобаларға үлес қосу
- [ ] Техникалық интервьюға дайындалу

---

> **Мотивация:** "{course_title} — бұл тек теория емес, бұл ойлау тәсілі. Осы модульді аяқтау — кәсіби өсудің нақты қадамы."
"""

    else:  # lesson_pos == 5 — мини-тест
        return f"""## 🧪 {lesson_title} — Модуль тесті

### 🎯 {module_title} модулін тексеру уақыты!

Сіз **{module_title}** модулінің 4 сабағын аяқтадыңыз. Енді өзіңізді тексеріңіз!

---

### 📋 Мини-тест: 3 сұрақ

Төмендегі сұрақтарға жауап беріп, тапсырмада **БАРЛЫҚ 3 жауапты** жазыңыз.

---

#### ❓ Сұрақ 1
**{module_title}** модулінің ең маңызды принципі не?
> Жауап: теориялық негіз

#### ❓ Сұрақ 2
Практикалық мысалда қолданылатын негізгі тәсіл қандай?
> Жауап: практикалық тәсіл

#### ❓ Сұрақ 3
Бұл модульде үйренген ең маңызды дағды не?
> Жауап: үйренген дағды

---

### 💡 Тапсырманы орындау нұсқаулығы

**Тапсырма жолағына мынаны жазыңыз:**
```
1. [Бірінші жауап]
2. [Екінші жауап]
3. [Үшінші жауап]
```

**Мысалы:**
```
1. архитектура принципі
2. оңтайлы алгоритм
3. қате өңдеу
```

---

### 🏅 Бағалау критерийлері

| Критерий | Балл |
|----------|------|
| Барлық 3 сұраққа жауап | 60% |
| Мысалмен дәлелдеу | 30% |
| Дұрыс терминология | 10% |

---

> **⚠️ Назар аударыңыз:** Тапсырмада кілт сөздерді пайдаланыңыз. Жауабыңыз кем дегенде 20 символ болуы тиіс.

### ✅ Модульді аяқтаңыз!
Тапсырманы сәтті орындасаңыз — **{module_title}** модулі аяқталады және келесі модуль ашылады! 🎉
"""

# ── Тапсырмалар мен жауаптар ─────────────────────────────────────────────────
def make_assignment(course_title, module_title, lesson_title, lesson_pos, level):
    if lesson_pos in [1, 2, 3, 4]:
        tasks = [
            f'"{course_title}" курсы бойынша "{lesson_title}" тақырыбының негізгі мағынасын өз сөзіңізбен жазыңыз (кем дегенде 2 сөйлем).',
            f'"{lesson_title}" тақырыбындағы практикалық мысалды оқып, оны қалай қолдануға болатынын 2-3 сөйлеммен сипаттаңыз.',
            f'"{module_title}" модулінен үйренгеніңізді жазыңыз: ең маңызды 2 ұғымды атаңыз.',
            f'"{lesson_title}" тақырыбы "{course_title}" курсымен қалай байланысты? Нақты мысалмен түсіндіріңіз.',
        ]
        return tasks[(lesson_pos - 1) % len(tasks)]
    else:
        return (
            f'🧪 Модуль тесті: "{module_title}" модулінде үйренгенді дәлелдеңіз.\n\n'
            f'Тапсырма жолағына мыналарды жазыңыз:\n'
            f'1. Осы модульдің негізгі тақырыбы (1 сөйлем)\n'
            f'2. Практикада қолданатын бір нақты тәсіл немесе команда\n'
            f'3. Берілген кілт сөзді жазыңыз: модуль\n\n'
            f'Жауабыңыз кем дегенде 20 символ болуы тиіс.'
        )

def make_answer(course_title, module_title, lesson_title, lesson_pos, level):
    if lesson_pos in [1, 2, 3, 4]:
        # Open-ended — any answer with 10+ chars accepted
        return "any"
    else:
        # Module test — keyword "модуль" or "module" must be present
        return "модуль|module|тест|негізгі"

# ── Негізгі скрипт ────────────────────────────────────────────────────────────
print("🚀 Уроктар мазмұнын байыту басталды...")

# Барлық курстар мен уроктарды алу
raw = psql(
    'SELECT l.id, l.title, l."order", l."moduleId", c.title as ctitle, c.level '
    'FROM lessons l '
    'JOIN courses c ON c.id = l."courseId" '
    'ORDER BY l."courseId", l."order";'
)

lessons = []
for line in raw.split("\n"):
    if "\t" in line:
        parts = line.split("\t")
        if len(parts) == 6:
            lessons.append({
                "id": parts[0],
                "title": parts[1],
                "order": int(parts[2]),
                "moduleId": parts[3],
                "ctitle": parts[4],
                "level": parts[5],
            })

print(f"📚 Жалпы урок саны: {len(lessons)}")

# Модульдер бойынша топтастыру (lesson position within module)
module_positions = {}  # moduleId -> [lesson_id1, ...]
for l in lessons:
    mid = l["moduleId"]
    if mid not in module_positions:
        module_positions[mid] = []
    module_positions[mid].append(l["id"])

# Модуль атаулары
mod_raw = psql('SELECT id, title FROM course_modules;')
mod_titles = {}
for line in mod_raw.split("\n"):
    if "\t" in line:
        parts = line.split("\t")
        if len(parts) == 2:
            mod_titles[parts[0]] = parts[1]

print("📝 SQL генерация басталды...")

sql_parts = []
updated = 0

for lesson in lessons:
    lid = lesson["id"]
    mid = lesson["moduleId"]
    ctitle = lesson["ctitle"]
    level = lesson["level"]
    mod_lessons = module_positions.get(mid, [])
    lesson_pos = mod_lessons.index(lid) + 1 if lid in mod_lessons else 1
    mod_title = mod_titles.get(mid, "Модуль")

    # Lesson title — берілген (курс+сабақ атауы бар)
    lesson_title = lesson["title"]
    # Курс атауы префиксін алу
    short_title = lesson_title
    if ": " in lesson_title:
        short_title = lesson_title.split(": ", 1)[1]

    content = make_content(ctitle, mod_title, short_title, lesson_pos, level)
    assignment = make_assignment(ctitle, mod_title, short_title, lesson_pos, level)
    answer = make_answer(ctitle, mod_title, short_title, lesson_pos, level)

    sql_parts.append(
        f"UPDATE lessons SET "
        f"content = '{esc(content)}', "
        f"assignment = '{esc(assignment)}', "
        f"\"assignmentAnswer\" = '{esc(answer)}' "
        f"WHERE id = '{lid}';"
    )
    updated += 1

print(f"📊 Жаңарту жазбалары: {updated}")
print("💾 Базаға жазылуда...")

BATCH = 100
batches = (len(sql_parts) + BATCH - 1) // BATCH
for i in range(batches):
    chunk = "\n".join(sql_parts[i*BATCH:(i+1)*BATCH])
    ok = run_sql_file(chunk)
    done = min((i+1)*BATCH, len(sql_parts))
    status = "✓" if ok else "⚠"
    print(f"  {status} {done}/{len(sql_parts)} жазба жаңартылды")

# Нәтиже тексеру
r1 = psql("SELECT COUNT(*) FROM lessons WHERE assignment IS NOT NULL;")
r2 = psql('SELECT COUNT(*) FROM lessons WHERE "assignmentAnswer" = \'any\';')
r3 = psql('SELECT COUNT(*) FROM lessons WHERE "assignmentAnswer" LIKE \'%модуль%\';')
print(f"\n📊 Нәтиже:")
print(f"  Тапсырмасы бар уроктар: {r1}")
print(f"  Еркін жауап (any): {r2}  ← оқу уроктары")
print(f"  Мини-тест уроктары: {r3}  ← модуль тесттері")
print("\n✅ Дайын! Барлық уроктар байытылды.")
print("   📖 Уроктар 1-4: оқу + еркін жауап (10+ символ)")
print("   🧪 Урок 5-ші (модуль соңы): мини-тест + keyword тексеру")


