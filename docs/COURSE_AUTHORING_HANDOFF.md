# Course authoring handoff — Phase B

This contract describes the implemented teacher editor and REST DTOs. Full syllabi, professional videos, a large exercise bank and academic review remain Phase B content production. They are not required to rebuild or change the platform.

## Authoring without source changes

1. Sign in as the course's teacher (or administrator). Open `/dashboard/teacher/courses`, choose **Жаңа курс**, enter metadata and create the draft.
2. In the course editor save title, description and level. Add modules in numeric order, lessons in numeric order, and TEXT, VIDEO or TASK steps. Save each editor before switching sections.
3. Add an exam, edit its duration/passing percentage, add questions and assign eligible proctors through the existing assignment control.
4. Review the checklist below, save pending fields, then explicitly choose **Курсты жариялау**. Another teacher cannot edit or publish the course.
5. To stop new enrollment choose **Мұрағаттау**. Existing learners retain their material, progress and results through **Менің оқуым**. Republishing is explicit.

## Fields and content formats

| Object | Implemented fields and rules |
| --- | --- |
| Course | `title` (trimmed, nonblank, at most 200 characters), optional `description` (at most 20,000), `level`: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`. Owner is assigned from authenticated identity. |
| Audience/language/prerequisites/outcomes | No separate structured fields exist. State these clearly in `description`, including the teaching language. Do not send invented DTO properties. |
| Module | `title`, positive integer `order`. Orders are numeric; use distinct positions within a course. |
| Lesson | `title`, required `content`, positive integer `order`; optional `videoUrl`, `assignment`, private `assignmentAnswer`. Both direct course lessons and module lessons are supported by the API. The teacher editor primarily uses module lessons. |
| TEXT step | `type: "TEXT"`, positive `order`, `content: { html: "<p>...</p>" }`. Student HTML goes through the existing safe renderer. |
| VIDEO step | `type: "VIDEO"`, `order`, `content: { videoUrl, description }`. Supply an HTTP(S) URL or site-root media path such as `/demo/html-structure.webm`; the editor does not upload/transcode a video library. Check playback in the actual demo browser. |
| TASK step | `type: "TASK"`, `order`, `content: { question, taskType, options?, correctAnswer, explanation? }`. `single_choice` uses one option string; `multiple_choice` uses an array of distinct option strings; `text_input` uses normalized exact text; `number_input` uses a finite numeric value. |
| Exam | `title`, `duration` in minutes (1–1440), `passScore` (0–100), `questions` array. An empty exam can be saved while authoring; it is not an acceptable completed assessment. Use a policy-valid duration for acceptance. |
| Question | `text`, `type`: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TEXT`; `options` for choice questions; private string `answer`. Multiple-choice answers are normalized to a JSON string array. |

TASK grading is deterministic and returns 100 or 0 per task. Choice options must be distinct and contain the correct options. Text and numeric tasks require usable answer keys. Legacy lesson assignments use the existing normalized substring/keyword grading; do not describe these as semantic grading or arbitrary code execution. The special legacy `any` answer is a length check, unsuitable for assessing knowledge.

The product does not currently offer a teacher-marked essay/rubric workflow for lesson submissions. Do not label automatically checked tasks as human reviewed. Exam proctor decisions concern the existing exam review policy, not a new essay grader. Pedagogical rubrics and explanatory model solutions belong in private author materials until the corresponding workflow is implemented.

## Publication and history

New courses default to `DRAFT`. The additive migration also maps legacy courses to `DRAFT`; it deliberately does not publish them in bulk. Existing enrollments still authorize material access. The owner reviews legacy content and explicitly publishes appropriate courses.

Public catalog, course detail and module outlines show `PUBLISHED` courses only. Full lesson content remains enrollment/owner/admin scoped even when published. Publication requires a saved title, description and at least one lesson; this is a minimum structural check, not academic validation. `publishedAt` records first publication and is preserved on archive/republish. Course deletion through the previous DELETE endpoint now archives instead of cascading educational records.

There is no parallel versioned draft of an already published course. Saved edits are immediately visible to current learners. Plan material changes carefully. Deleting modules/lessons with recorded progress or submissions, and steps with submissions, returns a conflict to preserve learner history. Active exam attempts retain their established snapshot and existing mutation restrictions. Use a separate new course when the curriculum needs a materially different edition; copying is manual, not a claimed import feature.

## Small supported API example

The following are request bodies for existing authenticated authoring endpoints, not an importer or portable runtime schema. Replace IDs with real responses. The UI performs these operations without source edits.

`POST /courses`

```json
{"title":"Веб негіздері","description":"Тілі: қазақша. Аудитория: бастаушылар. Алғышарт: браузерді пайдалану. Нәтиже: HTML тақырыбын тану.","level":"BEGINNER"}
```

`POST /courses/{courseId}/modules`

```json
{"title":"HTML құрылымы","order":1}
```

`POST /modules/{moduleId}/lessons`

```json
{"title":"Тақырып элементі","content":"h1 негізгі тақырыпты белгілейді.","order":1}
```

`POST /lessons/{lessonId}/steps` — teacher-only authoring request; keep this key out of student/public exports:

```json
{"type":"TASK","order":1,"content":{"question":"Негізгі тақырып элементін таңдаңыз","taskType":"single_choice","options":["h1","p"],"correctAnswer":"h1"}}
```

Then `POST /courses/{courseId}/publish` with an empty body. Public previews contain navigation metadata only. Student material and task responses omit answer keys/explanations; authorized teachers/admins can retrieve them to edit.

## Prepublication checklist

- State language, audience, prerequisites and observable outcomes; match level and lesson sequence.
- Supply coherent lesson text and explicit distinct numeric module/lesson/step order.
- Check every video URL, audio level, caption/transcript and media license. Label placeholder demonstration footage honestly.
- Use original/licensed text, imagery and media; record creator, source, license, acquisition date and permitted reuse alongside private course production notes.
- Use headings, readable paragraphs, descriptive links, alternative descriptions and captions; check keyboard navigation and long Kazakh text on a narrow screen.
- Verify every deterministic task with one correct and one incorrect answer; check valid option sets and private solutions.
- Populate the intended exam, verify answer formats/passing percentage/duration, and assign appropriate proctors.
- Check the public preview anonymously, material as an enrolled student, and forbidden reads/mutations as a second teacher.
- Save all changes before publication. Test enrollment, lesson completion, resume and certificate eligibility on fictional users.
- Export public/student material without private keys, solutions, credentials or personal data.

## Deferred production work

Phase B: comprehensive course programs, original lectures and transcripts, graded exercise sets, worked explanations, editorial and academic review, licensing/provenance records and learner evaluation. These are content deliverables. Human-scored essay/rubric authoring, independent content revisions and an import pipeline are not claimed as existing software capabilities.

## Outline only: новый DRAFT «Веб-әзірлеу негіздері: HTML және CSS»

Статус подготовки: **план контента, в БД не создан и не опубликован**. Это отдельный новый курс; существующий демонстрационный курс и его learner states не редактируются. Начать авторское наполнение можно независимо от AI, когда согласованы аудитория/результаты и материалы проходят checklist выше. Наличие структуры не означает готовность программы.

Метаданные: level BEGINNER. В description: «Тілі: қазақша. Аудитория: веб-әзірлеуді бастайтындар. Алғышарт: браузер мен мәтіндік редакторды пайдалану. Нәтиже: семантикалық HTML құрылымын құру, CSS селекторлары мен box model қолдану, қарапайым бейімделгіш бетті тексеру». Отдельные поля language/outcomes не добавлять.

| Module order / title | Planned ordered lessons | Existing supported assessment |
|---|---|---|
|1 — HTML құрылымы|1 Документ және негізгі тегтер;2 Тақырыптар, мәтін және сілтемелер;3 Семантика және суреттердің балама мәтіні|TEXT; single_choice по структуре; multiple_choice по семантическим элементам; text_input по точному имени тега|
|2 — CSS негіздері|1 Селекторлар және каскад;2 Box model;3 Түстер, қаріптер және аралықтар|TEXT; single_choice по selector/cascade; number_input по детерминированному вычислению размеров|
|3 — Бейімделгіш бет және тексеру|1 Flex/grid негіздері;2 Media queries;3 Қолжетімділік және тексеру|TEXT; multiple_choice по responsive/accessibility; короткие exact text_input ответы|

Для каждого урока подготовить оригинальный текст, примеры HTML/CSS и объяснение правильного/неправильного ответа; private correctAnswer/explanation хранить через реальный редактор TASK, не в публичном описании. Практическое создание страницы выполняется учащимся в своём редакторе как упражнение: платформа не запускает его код и не умеет ставить за него human essay/rubric grade. Проверяемые TASK ограничить однозначными вопросами существующих типов. Видео добавлять только когда готов лицензированный HTTP(S)/site-root URL и транскрипт; загрузку/транскодирование не обещать.

План итогового экзамена:12 вопросов существующих SINGLE_CHOICE/MULTIPLE_CHOICE/TEXT,20 минут,passScore75, назначенный проктор. Конкретные ключи и варианты создаются при авторской разработке и проверяются до публикации; равновесное автоматическое оценивание, без LLM/произвольных весов/кода. Финальный проект пока необязательное учебное упражнение, не скрытый обязательный human-graded prerequisite.

Создать будущий курс кнопкой «Жаңа курс» как DRAFT, сохранять модули/уроки вручную, проверять каждый TASK верным и неверным ответом на отдельном вымышленном учащемся после готовности материала. Не публиковать неполный контент. Для серьёзной новой редакции нужен другой курс: parallel published/draft versions и content importer отсутствуют.
