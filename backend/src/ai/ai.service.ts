import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './ai.dto';

// ─── Local knowledge base for platform questions (when Groq unavailable) ───
const PLATFORM_KB: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ['курс', 'course', 'бар', 'бастау', 'оқу', 'тіркел'],
    answer: `ProctoLearn платформасында **3 деңгейде** курстар бар:\n- 🟢 **Жаңадан бастаушы** — негіздер, HTML/CSS/JS\n- 🟡 **Орта деңгей** — React, API, деректер қоры\n- 🔴 **Жоғары деңгей** — архитектура, DevOps, қауіпсіздік\n\nКурсқа тіркелу үшін «Курстар» бетіне өтіп, қажет курсты таңдаңыз.`,
  },
  {
    keywords: ['сертификат', 'certificate', 'алу', 'қалай'],
    answer: `Сертификат алу үшін:\n1. Курстың барлық сабақтарын аяқтаңыз ✅\n2. Емтиханды тапсырып, өту балынан асыңыз 🎯\n3. Сертификат автоматты түрде беріледі 🏆\n\nСертификаттарыңызды **«Сертификаттарым»** бетінен жүктей аласыз (PDF форматында).`,
  },
  {
    keywords: ['емтихан', 'exam', 'тест', 'тапсыру', 'бастау', 'балл', 'score'],
    answer: `Емтихан туралы:\n- Барлық сабақтарды аяқтаған соң емтиханға кіруге рұқсат беріледі\n- Емтиханда **прокторинг** жүйесі іске қосылады (веб-камера)\n- **Trust Score** деп аталатын сенімділік балы есептеледі\n- Өту балынан асқанда сертификат беріледі\n\nЕмтиханды тапсыру үшін курс бетіне өтіп «Емтиханды бастау» батырмасын басыңыз.`,
  },
  {
    keywords: ['прокторинг', 'proctor', 'камера', 'trust', 'score', 'бақылау'],
    answer: `Прокторинг жүйесі:\n- Емтихан кезінде **веб-камера** арқылы кандидат бақыланады\n- **Trust Score** (0-100 балл) автоматты есептеледі:\n  - Беттен шығу: −10 ұпай\n  - Көшіру/қою: −15 ұпай\n  - Толық экраннан шығу: −5 ұпай\n  - Бет анықталмаса: −20 ұпай\n- Проктор нақтылы уақытта қадағалай алады`,
  },
  {
    keywords: ['сабақ', 'lesson', 'тапсырма', 'assignment', 'жауап', 'ашу', 'қол жетімді'],
    answer: `Сабақтар туралы:\n- Сабақтар **ретпен** ашылады (алдыңғысын аяқтасаңыз келесісі ашылады)\n- Әр сабақта мазмұн, видео және **тапсырма** болуы мүмкін\n- Тапсырманы дұрыс орындасаңыз, сабақ **«Аяқталды»** деп белгіленеді\n- Сертификат алғаннан кейін барлық сабақтар **қол жетімді** болады`,
  },
  {
    keywords: ['пароль', 'password', 'кіру', 'login', 'тіркелу', 'register', 'аккаунт'],
    answer: `Аккаунт туралы:\n- **Кіру**: Email және пароль арқылы\n- **Профиль**: Дашбордтың жоғарғы оң жақ бұрышынан\n- **Сертификаттар**: «Сертификаттарым» бетінде\n- **Пароль ұмытсаңыз**: Администраторға хабарласыңыз`,
  },
  {
    keywords: ['прогресс', 'progress', 'барыс', 'қанша', 'аяқтадым', 'пайыз'],
    answer: `Прогрессіңізді курс бетінде көре аласыз:\n- Жасыл жолақ — аяқталған сабақтар саны\n- Әр сабақ жанындағы ✅ белгі\n- «Курс барысы» бетінде толық статистика\n\nЕмтиханды тапсырып болғаннан кейін курс **«Аяқталды»** деп белгіленеді.`,
  },
  {
    keywords: ['рөл', 'role', 'мұғалім', 'teacher', 'студент', 'student', 'admin'],
    answer: `Платформада **4 рөл** бар:\n- 👨‍🎓 **Студент** — курстарды оқиды, емтихандар тапсырады\n- 👨‍🏫 **Мұғалім** — курстар мен сабақтар жасайды\n- 👁️ **Проктор** — емтихандарды қадағалайды\n- 🔧 **Admin** — барлық жүйені басқарады`,
  },
  {
    keywords: ['n8n', 'automation', 'хабарлама', 'email', 'уведомление'],
    answer: `Платформа автоматтандыру жүйесі **n8n** арқылы жұмыс жасайды:\n- Емтихан аяқталғанда автоматты email хабарлама жіберіледі\n- Сертификат берілгенде тіркелген адреске хабар жіберіледі\n\nЭлектронды поштаңызды профильде дұрыс толтырыңыз.`,
  },
];

function localFallback(message: string, userName: string, enrollments: any[], attempts: any[]): string | null {
  const lower = message.toLowerCase();

  // Check knowledge base
  for (const entry of PLATFORM_KB) {
    if (entry.keywords.some((k) => lower.includes(k))) {
      return entry.answer;
    }
  }

  // Greetings
  if (/сәлем|привет|hello|hi|сал|ассалаума/.test(lower)) {
    return `Сәлем, ${userName}! 👋 Мен ProctoLearn AI ассистентімін.\n\nСізге қалай көмектесе алам? Мысалы:\n- Курстар туралы сұраңыз\n- Емтиханға дайындалу жолдарын біліңіз\n- Платформаны пайдалану бойынша сұрақтар қойыңыз`;
  }

  // Questions about their courses
  if (/менің курс|my course|курстары|қандай курс/.test(lower)) {
    if (enrollments.length === 0) {
      return `Сіз әлі ешбір курсқа тіркелмегенсіз. **Курстар** бетіне өтіп, өзіңізге ұнаған курсты таңдаңыз! 🎓`;
    }
    const list = enrollments.map((e: any) => `- 📚 **${e.course.title}** (${e.course._count.lessons} сабақ)`).join('\n');
    return `Сіздің курстарыңыз:\n${list}\n\nОларды **«Курстарым»** бетінде көре аласыз.`;
  }

  // Results
  if (/нәтиже|result|балл|score|өттім|passed|failed/.test(lower)) {
    if (attempts.length === 0) {
      return `Сіз әлі ешбір емтихан тапсырмаған сияқтысыз. Бастауға дайынсыз ба? 💪`;
    }
    const list = attempts.map((a: any) =>
      `- ${a.exam.title}: **${a.score ?? 0}%** (${a.status === 'FINISHED' ? '✅ Өтті' : '❌ Өтпеді'})`
    ).join('\n');
    return `Соңғы нәтижелеріңіз:\n${list}`;
  }

  return null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async chat(userId: string, dto: ChatMessageDto): Promise<{ reply: string }> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_MODEL') ?? 'llama3-8b-8192';

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            _count: { select: { lessons: true, exams: true } },
          },
        },
      },
      take: 10,
    });

    const recentAttempts = await this.prisma.attempt.findMany({
      where: { userId },
      include: {
        exam: { select: { title: true, passScore: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    let courseContext = '';
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: dto.courseId },
        include: {
          lessons: { select: { title: true, order: true }, orderBy: { order: 'asc' }, take: 20 },
          exams: { select: { title: true, passScore: true } },
        },
      });
      if (course) {
        courseContext = `\n\nАғымдағы курс: "${course.title}" (${course.level})\nСипаттама: ${course.description ?? 'жоқ'}\nСабақтар (${course.lessons.length}): ${course.lessons.map((l) => `${l.order}. ${l.title}`).join(', ')}\nЕмтихандар: ${course.exams.map((e) => `${e.title} (өту шегі: ${e.passScore}%)`).join(', ')}`;
      }
    }

    const enrollmentList = enrollments
      .map((e) => `- ${e.course.title} (${e.course.level}): ${e.course._count.lessons} сабақ, ${e.course._count.exams} емтихан`)
      .join('\n');

    const attemptList = recentAttempts
      .map((a) => `- ${a.exam.title}: ${a.score ?? 0}% (${a.status === 'FINISHED' ? 'өтті' : a.status === 'FAILED' ? 'өтпеді' : a.status})`)
      .join('\n');

    const userName = user?.name ?? 'Студент';

    // ── If no API key or key likely invalid, use local fallback ──
    if (!apiKey) {
      const local = localFallback(dto.message, userName, enrollments, recentAttempts);
      return { reply: local ?? 'AI ассистент әзірше конфигурацияланбаған. Администраторға хабарласыңыз.' };
    }

    const systemPrompt = `Сен ProctoLearn — онлайн оқыту платформасының AI ассистентісің.
Пайдаланушыларға платформаны пайдалану, курстар, сабақтар, емтихандар, сертификаттар және технологиялар туралы кеңестер бересің.

Платформа туралы:
- ProctoLearn — курстар, сабақтар, прокторингпен емтихандар бар онлайн оқыту платформасы
- 3 деңгей: Жаңадан бастаушы (BEGINNER), Орта (INTERMEDIATE), Жоғары (ADVANCED)
- 4 рөл: Студент, Мұғалім, Проктор, Admin
- JWT аутентификация (15 мин + 7 күн refresh token)
- Trust Score: tab_switch −10, copy/paste −15, fullscreen_exit −5, no_face −20
- Сертификат: барлық сабақтарды аяқтап, емтихан өткен соң беріледі (PDF жүктеуге болады)
- MinIO S3 — файл қоймасы
- n8n — автоматтандыру (емтихан аяқталса email жіберіледі)
- Сабақтар ретпен ашылады; алдыңғысын аяқтамай келесісіне өту мүмкін емес
- Сертификат алғаннан кейін барлық сабақтар қол жетімді болып қалады

Пайдаланушы: ${userName} (${user?.role ?? 'STUDENT'})
Жазылған курстар:
${enrollmentList || 'Жоқ'}
Соңғы емтихан нәтижелері:
${attemptList || 'Жоқ'}${courseContext}

Жауап беру ережелері:
1. Платформа, оқу, курстар, технологиялар туралы кез-келген сұраққа жауап бер
2. Қазақша немесе орысша жауап бер (пайдаланушы қай тілде сұраса, сол тілде)
3. Қысқа және нақты жауап бер (максимум 400 сөз)
4. Маркдаун форматтауды қолдан (тізімдер, **қалың**, тақырыптар)
5. Тек негізсіз зиянды мазмұнды қаламайсың`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (dto.history && dto.history.length > 0) {
      const lastN = dto.history.slice(-6);
      messages.push(...lastN.map((m) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: dto.message });

    try {
      const res = await fetch(this.groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 700,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`Groq API error: ${res.status} ${errText}`);
        // Fall back to local KB on API error
        const local = localFallback(dto.message, userName, enrollments, recentAttempts);
        return { reply: local ?? 'AI қызметі қазіргі уақытта қол жетімді емес. Сәл кейін қайталаңыз.' };
      }

      const data: any = await res.json();
      const reply: string = data.choices?.[0]?.message?.content ?? 'Жауап алынбады.';
      return { reply };
    } catch (err) {
      this.logger.error('AI service error', err);
      // Fall back to local KB on network error
      const local = localFallback(dto.message, userName, enrollments, recentAttempts);
      return { reply: local ?? 'AI қызметі қазіргі уақытта қол жетімді емес.' };
    }
  }
}
