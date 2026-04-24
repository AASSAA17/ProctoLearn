DO $$
DECLARE v_course_id TEXT; v_exam_id TEXT;
BEGIN
  SELECT id INTO v_course_id FROM courses WHERE title='HTML и CSS с нуля';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'HTML и CSS: Финальный тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'HTML тегі не?','SINGLE_CHOICE','["Стиль тілі","Веб-бет тегі","Бағдарлама тілі","Дерекқор тілі"]','Веб-бет тегі'),
    (gen_random_uuid()::text,v_exam_id,'CSS color не анықтайды?','SINGLE_CHOICE','["Фон","Мәтін түсі","Жиек","Сурет"]','Мәтін түсі'),
    (gen_random_uuid()::text,v_exam_id,'<div> тегі қандай?','SINGLE_CHOICE','["Inline","Block","Flex","Grid"]','Block'),
    (gen_random_uuid()::text,v_exam_id,'CSS класс белгісі?','SINGLE_CHOICE','["#","@",".","!"]','.'),
    (gen_random_uuid()::text,v_exam_id,'Сілтеме тегі?','SINGLE_CHOICE','["<link>","<a>","<href>","<url>"]','<a>');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='JavaScript для начинающих';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'JavaScript: Базовый тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Айнымалы жариялау?','SINGLE_CHOICE','["var let const","int float","dim set","define declare"]','var let const'),
    (gen_random_uuid()::text,v_exam_id,'typeof null?','SINGLE_CHOICE','["null","undefined","object","string"]','object'),
    (gen_random_uuid()::text,v_exam_id,'2 + "3" нәтижесі?','SINGLE_CHOICE','["5","23","NaN","Error"]','23'),
    (gen_random_uuid()::text,v_exam_id,'Массив синтаксис?','SINGLE_CHOICE','["[]","{}","()","<>"]','[]'),
    (gen_random_uuid()::text,v_exam_id,'=== vs == айырмашылығы?','SINGLE_CHOICE','["=== типті тексереді","== типті тексереді","Айырмашылық жоқ","=== тек сандар"]','=== типті тексереді');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Python: первые шаги';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'Python: Кіріспе тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Python шарт операторы?','SINGLE_CHOICE','["if x:","if (x)","IF THEN","if x do"]','if x:'),
    (gen_random_uuid()::text,v_exam_id,'Экранға шығару?','SINGLE_CHOICE','["print()","echo()","console.log()","write()"]','print()'),
    (gen_random_uuid()::text,v_exam_id,'Пікір белгісі?','SINGLE_CHOICE','["//","#","/*","--"]','#'),
    (gen_random_uuid()::text,v_exam_id,'Тізім синтаксис?','SINGLE_CHOICE','["[]","{}","()","<>"]','[]'),
    (gen_random_uuid()::text,v_exam_id,'len([1,2,3])?','SINGLE_CHOICE','["1","2","3","0"]','3');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Git и GitHub с нуля';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'Git: Кіріспе тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Репозиторий инит?','SINGLE_CHOICE','["git init","git start","git begin","git new"]','git init'),
    (gen_random_uuid()::text,v_exam_id,'Staging-ке қосу?','SINGLE_CHOICE','["git add","git stage","git push","git save"]','git add'),
    (gen_random_uuid()::text,v_exam_id,'Коммит?','SINGLE_CHOICE','["git commit -m","git save","git push","git log"]','git commit -m'),
    (gen_random_uuid()::text,v_exam_id,'git log не?','SINGLE_CHOICE','["Файлдар","Коммит тарихы","Тармақ","Сервер"]','Коммит тарихы'),
    (gen_random_uuid()::text,v_exam_id,'git status не?','SINGLE_CHOICE','["Каталог жағдайы","Серверге қосылу","Коммит нөмірі","Пайдаланушы"]','Каталог жағдайы');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Основы SQL';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'SQL: Базовый тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Барлық деректер?','SINGLE_CHOICE','["SELECT * FROM t","GET ALL FROM t","FETCH * IN t","READ * FROM t"]','SELECT * FROM t'),
    (gen_random_uuid()::text,v_exam_id,'WHERE не?','SINGLE_CHOICE','["Сұрыптау","Фильтрлеу","Кесте жасау","Жою"]','Фильтрлеу'),
    (gen_random_uuid()::text,v_exam_id,'Өсу сұрыптау?','SINGLE_CHOICE','["ORDER BY ASC","SORT BY ASC","GROUP BY","HAVING"]','ORDER BY ASC'),
    (gen_random_uuid()::text,v_exam_id,'COUNT() не?','SINGLE_CHOICE','["Жолдар","Бағандар","Өлшем","Кестелер"]','Жолдар'),
    (gen_random_uuid()::text,v_exam_id,'Жол қосу?','SINGLE_CHOICE','["INSERT INTO","ADD ROW","CREATE ROW","PUT INTO"]','INSERT INTO');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Docker для разработчиков';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'Docker: Негіздер тесті',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Docker контейнер не?','SINGLE_CHOICE','["ВМ","Оқшауланған процесс","Файл жүйесі","Хаттама"]','Оқшауланған процесс'),
    (gen_random_uuid()::text,v_exam_id,'Image жасау?','SINGLE_CHOICE','["docker build","docker create","docker make","docker compile"]','docker build'),
    (gen_random_uuid()::text,v_exam_id,'Контейнерлер тізімі?','SINGLE_CHOICE','["docker ps","docker list","docker show","docker ls"]','docker ps'),
    (gen_random_uuid()::text,v_exam_id,'FROM не?','SINGLE_CHOICE','["Базалық image","Порт ашу","Файл көшіру","Команда"]','Базалық image'),
    (gen_random_uuid()::text,v_exam_id,'compose up -d не?','SINGLE_CHOICE','["Жою","Фонда іске қосу","Логтар","Image жасау"]','Фонда іске қосу');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Node.js для начинающих';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'Node.js: Кіріспе тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'Node.js не?','SINGLE_CHOICE','["Браузер JS","Серверлік JS","Python","Дерекқор"]','Серверлік JS'),
    (gen_random_uuid()::text,v_exam_id,'NPM не?','SINGLE_CHOICE','["Node Package Manager","New Project Manager","Node Program","Network Protocol"]','Node Package Manager'),
    (gen_random_uuid()::text,v_exam_id,'Файл оқу модулі?','SINGLE_CHOICE','["fs","file","io","read"]','fs'),
    (gen_random_uuid()::text,v_exam_id,'npm install не?','SINGLE_CHOICE','["Тәуелділіктер орнату","Node жаңарту","Сервер іске қосу","Файл жасау"]','Тәуелділіктер орнату'),
    (gen_random_uuid()::text,v_exam_id,'require() не?','SINGLE_CHOICE','["Модуль импорт","Айнымалы","HTTP","Файл жасау"]','Модуль импорт');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='React.js — первое знакомство';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'React.js: Кіріспе тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'React не?','SINGLE_CHOICE','["Бэкенд фреймворк","UI кітапхана","Дерекқор","CSS"]','UI кітапхана'),
    (gen_random_uuid()::text,v_exam_id,'JSX не?','SINGLE_CHOICE','["JavaScript XML","Java Extension","JSON","Syntax"]','JavaScript XML'),
    (gen_random_uuid()::text,v_exam_id,'State хугі?','SINGLE_CHOICE','["useState","useEffect","useContext","useRef"]','useState'),
    (gen_random_uuid()::text,v_exam_id,'props не?','SINGLE_CHOICE','["Параметрлер","CSS","JS функция","HTML"]','Параметрлер'),
    (gen_random_uuid()::text,v_exam_id,'Virtual DOM?','SINGLE_CHOICE','["DOM оңтайландыру","CSS","HTTP","Файл"]','DOM оңтайландыру');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='NestJS: бэкенд на TypeScript';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'NestJS: Аралық тест',40,65) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'NestJS архитектурасы?','SINGLE_CHOICE','["Монолит","Модульдік","Serverless","Event-Driven"]','Модульдік'),
    (gen_random_uuid()::text,v_exam_id,'@Injectable() не?','SINGLE_CHOICE','["HTTP эндпоинт","DI тіркеу","Модуль","Guard"]','DI тіркеу'),
    (gen_random_uuid()::text,v_exam_id,'@Controller() не?','SINGLE_CHOICE','["Дерекқор","Маршруттар классы","Сервис","Мидлвэр"]','Маршруттар классы'),
    (gen_random_uuid()::text,v_exam_id,'Guard не?','SINGLE_CHOICE','["Логдау","Авторизация","Трансформация","Кэш"]','Авторизация'),
    (gen_random_uuid()::text,v_exam_id,'DTO не?','SINGLE_CHOICE','["Data Transfer Object","Database Table","Dynamic Type","Default Template"]','Data Transfer Object');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='React Advanced: хуки и паттерны';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'React Advanced: Тест',40,65) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'useEffect 2-аргумент?','SINGLE_CHOICE','["Callback","Тәуелділіктер","Cleanup","Boolean"]','Тәуелділіктер'),
    (gen_random_uuid()::text,v_exam_id,'useMemo не?','SINGLE_CHOICE','["HTTP","Есептеу кэш","DOM","Стейт"]','Есептеу кэш'),
    (gen_random_uuid()::text,v_exam_id,'useCallback не кэштейді?','SINGLE_CHOICE','["Мән","Функция","DOM","Стейт"]','Функция'),
    (gen_random_uuid()::text,v_exam_id,'Context API не?','SINGLE_CHOICE','["HTTP","Деректер жеткізу","CSS","Файл"]','Деректер жеткізу'),
    (gen_random_uuid()::text,v_exam_id,'React.memo не?','SINGLE_CHOICE','["Хук","Қайта рендерлемеу","Контекст","Стейт"]','Қайта рендерлемеу');
  END IF;
  SELECT id INTO v_course_id FROM courses WHERE title='Основы TypeScript';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO exams(id,"courseId",title,duration,"passScore") VALUES(gen_random_uuid()::text,v_course_id,'TypeScript: Базовый тест',30,60) RETURNING id INTO v_exam_id;
    INSERT INTO questions(id,"examId",text,type,options,answer) VALUES
    (gen_random_uuid()::text,v_exam_id,'TypeScript не?','SINGLE_CHOICE','["Жаңа тіл","JS + типтер","Python","CSS"]','JS + типтер'),
    (gen_random_uuid()::text,v_exam_id,'Тип жариялау?','SINGLE_CHOICE','["let x: string","let x = string","string x","x as string"]','let x: string'),
    (gen_random_uuid()::text,v_exam_id,'interface не?','SINGLE_CHOICE','["Нысан пішіні","HTTP маршрут","Мұрагерлік","Импорт"]','Нысан пішіні'),
    (gen_random_uuid()::text,v_exam_id,'any типі не?','SINGLE_CHOICE','["Кез келген тип","Тек сан","Тек жол","Boolean"]','Кез келген тип'),
    (gen_random_uuid()::text,v_exam_id,'enum не?','SINGLE_CHOICE','["Аталған тұрақтылар","Массив","Функция","Интерфейс"]','Аталған тұрақтылар');
  END IF;
  RAISE NOTICE 'Done: 11 exams + 55 questions added!';
END $$;
SELECT level, COUNT(DISTINCT c.id) as courses, COUNT(DISTINCT e.id) as exams, COUNT(q.id) as questions
FROM courses c LEFT JOIN exams e ON e."courseId"=c.id LEFT JOIN questions q ON q."examId"=e.id
GROUP BY level ORDER BY level;
