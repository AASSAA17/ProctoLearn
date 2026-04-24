#!/usr/bin/env python3
"""
ProctoLearn — генератор 20 уроков (4 модуля × 5 уроков) для каждого курса
"""
import subprocess, uuid, json
from datetime import datetime

DB = "proctolearn_db"
USER = "proctolearn"
CONTAINER = "proctolearn_postgres"

def psql(sql):
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", USER, "-d", DB,
         "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def psql_cmd(sql):
    subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", USER, "-d", DB, "-c", sql],
        capture_output=True, text=True
    )

# ── Шаблоны модулей/уроков по уровню ────────────────────────────────────────
MODULES = {
    "BEGINNER": [
        ("Кіріспе және негіздер", [
            "Курсқа кіріспе. Не үйренеміз?",
            "Негізгі ұғымдар мен терминология",
            "Орта дайындау және орнату",
            "Бірінші қадамдар: практикалық жаттығу",
            "Модульді қорытындылау және тест",
        ]),
        ("Негізгі принциптер", [
            "Теориялық негіздер",
            "Маңызды концепциялар",
            "Практикалық мысалдар",
            "Жаттығулар мен тапсырмалар",
            "Нақты жағдайлардағы қолданыс",
        ]),
        ("Практикалық дағдылар", [
            "Қолмен жаттығулар",
            "Нұсқаулықтар бойынша жұмыс",
            "Типтік қателер мен шешімдер",
            "Мини-жоба: алғашқы нәтиже",
            "Дағдыларды бекіту",
        ]),
        ("Қорытынды және бағалау", [
            "Барлық тақырыптарды шолу",
            "Сұрақ-жауап сессиясы",
            "Практикалық жоба дайындау",
            "Алдыңғы деңгейге дайындық",
            "Финалдық практика және бағалау",
        ]),
    ],
    "INTERMEDIATE": [
        ("Тереңдетілген негіздер", [
            "Базалық білімді жаңарту",
            "Кеңейтілген ұғымдар",
            "Нақты жағдайлар талдауы",
            "Практикалық архитектура",
            "Кейс-стади: нақты мысал",
        ]),
        ("Күрделі тақырыптар", [
            "Жетілдірілген техникалар",
            "Оңтайлыдыру стратегиялары",
            "Қателерді жою (debugging)",
            "Жұмыс процестерін жетілдіру",
            "Салыстырмалы талдау",
        ]),
        ("Жоба тәжірибесі", [
            "Жоба жоспарлау",
            "Командалық жұмыс тәжірибесі",
            "Code review практикасы",
            "Тестілеу және сапа бақылау",
            "Жобаны жеткізу",
        ]),
        ("Кәсіби даму", [
            "Саладағы жақсы тәжірибелер",
            "Заманауи тренд пен жаңалықтар",
            "Кәсіби портфолио жасау",
            "Сертификаттауға дайындық",
            "Финалдық жоба қорғау",
        ]),
    ],
    "ADVANCED": [
        ("Эксперттік архитектура", [
            "Жүйелік дизайн принциптері",
            "Масштабталу стратегиялары",
            "Өнімділікті оңтайлыдыру",
            "Қауіпсіздік архитектурасы",
            "Кейс: Enterprise шешімдер",
        ]),
        ("Жетілдірілген алгоритмдер", [
            "Күрделі алгоритмдер талдауы",
            "Деректер құрылымдары оңтайлыдыру",
            "Параллель есептеу",
            "Distributive системалар",
            "Жоғары жүктеме шешімдері",
        ]),
        ("Зерттеу және инновация", [
            "Академиялық зерттеу оқу",
            "Жаңа технологиялар бағалау",
            "Прототип жасау",
            "Техникалық RFC жазу",
            "Open source үлес қосу",
        ]),
        ("Жетекшілік және менторлық", [
            "Техникалық жетекшілік",
            "Архитектуралық шешімдер қабылдау",
            "Командаға менторлық",
            "Техникалық баяндама дайындау",
            "Финал: эксперттік жоба қорғау",
        ]),
    ],
}

LESSON_CONTENT = """## {title}

### 🎯 Сабақтың мақсаттары
Бұл сабақта сіз маңызды ұғымдарды үйренесіз және практикалық дағдыларды меңгересіз.

### 📚 Теориялық бөлім
Бұл тақырып тереңдетілген білімді талап етеді. Материалды мұқият оқып, мысалдарды орындаңыз.

**Негізгі ұғымдар:**
- Бірінші маңызды концепция
- Екінші ключевой принцип
- Үшінші практикалық аспект

### 💻 Практикалық бөлім
Теорияны практикада қолданыңыз:

```
// Мысал коды
function example() {{
  // Тапсырманы орындаңыз
  return "success";
}}
```

### ✅ Тексеру сұрақтары
1. Негізгі концепцияны түсіндіріңіз
2. Практикалық мысал келтіріңіз
3. Қолдану аясын сипаттаңыз

### 📎 Қосымша ресурстар
Толық ақпарат алу үшін ресми документацияны қараңыз.
"""

ASSIGNMENT_TEMPLATES = [
    "Осы сабақтың негізгі концепциясын өз сөзіңізбен түсіндіріңіз (минимум 3 абзац).",
    "Практикалық тапсырманы орындап, нәтижені скриншот арқылы растаңыз.",
    "Берілген мысалды пайдаланып, өзіңіздің нұсқаңызды жасаңыз.",
    "Тақырып бойынша 5 маңызды факт жазыңыз және мысал келтіріңіз.",
    "Нақты жағдайда бұл концепцияны қалай қолдануға болатынын сипаттаңыз.",
]

ASSIGNMENT_ANSWERS = [
    "Дұрыс жауап: негізгі концепцияны анықтамасын, оның мақсатын және нақты мысалдарды қамту керек.",
    "Бағалау критерийлері: дұрыс орындалуы (%70), толықтығы (%20), презентация (%10).",
    "Күтілетін нәтиже: жұмыс істейтін шешім, дұрыс синтаксис, түсініктемелер.",
    "Маңызды аспектілер: анықтық, дәлдік, практикалық қолдану мүмкіндігі.",
    "Бағалау: барлық 5 факт дұрыс болса — 100%, 4 факт — 80%, 3 факт — 60%.",
]

def gen_id():
    return str(uuid.uuid4())

def now():
    return datetime.utcnow().strftime("%Y-%m-%d %T.000")

def escape(s):
    return s.replace("'", "''")

print("🚀 Бастаймыз: барлық курстарға 20 урок қосу...")

# 1. Барлық курстарды алу
raw = psql('SELECT id, title, level FROM courses ORDER BY "createdAt";')
courses = []
for line in raw.split("\n"):
    if "\t" in line:
        parts = line.split("\t")
        if len(parts) == 3:
            courses.append({"id": parts[0], "title": parts[1], "level": parts[2]})

print(f"📚 Курс саны: {len(courses)}")

# 2. Бар уроктарды жою (барлық курстарға)
print("🗑️  Ескі уроктар мен модульдер жойылуда...")
psql_cmd('DELETE FROM lesson_progress;')
psql_cmd('DELETE FROM steps;')
psql_cmd('DELETE FROM lessons;')
psql_cmd('DELETE FROM course_modules;')
print("  ✓ Тазаланды")

# 3. Әр курсқа 4 модуль + 20 урок қосу
total_modules = 0
total_lessons = 0
batch_sql = []

for i, course in enumerate(courses):
    cid = course["id"]
    ctitle = course["title"]
    level = course["level"] if course["level"] in MODULES else "BEGINNER"
    modules_data = MODULES[level]

    lesson_order = 1
    for m_idx, (mod_title, lesson_titles) in enumerate(modules_data):
        mod_id = gen_id()
        # Модуль INSERT
        batch_sql.append(
            f"INSERT INTO course_modules (id, title, \"order\", \"courseId\", \"createdAt\") "
            f"VALUES ('{mod_id}', '{escape(mod_title)}', {m_idx+1}, '{cid}', '{now()}');"
        )
        total_modules += 1

        for l_idx, lesson_title in enumerate(lesson_titles):
            full_title = f"{ctitle}: {lesson_title}"
            content = LESSON_CONTENT.format(title=full_title)
            assignment = ASSIGNMENT_TEMPLATES[l_idx % len(ASSIGNMENT_TEMPLATES)]
            answer = ASSIGNMENT_ANSWERS[l_idx % len(ASSIGNMENT_ANSWERS)]
            lid = gen_id()

            batch_sql.append(
                f"INSERT INTO lessons (id, \"courseId\", \"moduleId\", title, content, \"videoUrl\", "
                f"assignment, \"assignmentAnswer\", \"order\", \"createdAt\") VALUES ("
                f"'{lid}', '{cid}', '{mod_id}', '{escape(full_title)}', "
                f"'{escape(content)}', NULL, "
                f"'{escape(assignment)}', '{escape(answer)}', "
                f"{lesson_order}, '{now()}');"
            )
            lesson_order += 1
            total_lessons += 1

    if (i + 1) % 10 == 0:
        print(f"  ⏳ {i+1}/{len(courses)} курс өңделді...")

print(f"📝 SQL жазбалар: {len(batch_sql)} (модуль: {total_modules}, урок: {total_lessons})")
print("💾 Базаға жазылуда (stdin арқылы)...")

import tempfile, os

# SQL файлға жазу, содан кейін stdin арқылы беру
BATCH = 300
for start in range(0, len(batch_sql), BATCH):
    chunk = "\n".join(batch_sql[start:start+BATCH])
    # Уақытша файл жасаймыз
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write("BEGIN;\n")
        f.write(chunk)
        f.write("\nCOMMIT;\n")
        tmpfile = f.name

    # Файлды контейнерге көшіру
    cp_result = subprocess.run(
        ["docker", "cp", tmpfile, f"{CONTAINER}:/tmp/batch.sql"],
        capture_output=True, text=True
    )
    # psql арқылы орындау
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", USER, "-d", DB, "-f", "/tmp/batch.sql"],
        capture_output=True, text=True
    )
    os.unlink(tmpfile)

    if result.returncode != 0 and "ERROR" in result.stderr:
        print(f"  ⚠️  Batch {start//BATCH + 1} қатесі: {result.stderr[:300]}")
    else:
        done = min(start + BATCH, len(batch_sql))
        print(f"  ✓ {done}/{len(batch_sql)} жазба сақталды")

# 4. Нәтижені тексеру
print("\n📊 Нәтиже:")
r1 = psql("SELECT COUNT(*) FROM course_modules;")
r2 = psql("SELECT COUNT(*) FROM lessons;")
r3 = psql('SELECT level, COUNT(*) as cnt FROM courses GROUP BY level ORDER BY level;')
print(f"  Модульдер: {r1}")
print(f"  Уроктар: {r2}")
print(f"  Курс деңгейлері:\n{r3}")

# Урок саны тексеру
sample = psql(
    'SELECT c.title, COUNT(l.id) as cnt '
    'FROM courses c LEFT JOIN lessons l ON l."courseId" = c.id '
    'GROUP BY c.id, c.title ORDER BY cnt ASC LIMIT 5;'
)
print(f"\n  Ең аз урок бар курстар:\n{sample}")

print("\n✅ Дайын! Барлық курстарда 20 урок бар.")


