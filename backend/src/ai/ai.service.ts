import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './ai.dto';
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
    if (!apiKey) {
      return { reply: 'AI ассистент әзірше конфигурацияланбаған. Администраторға хабарласыңыз.' };
    }
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
      .map((a) => `- ${a.exam.title}: ${a.score ?? 0}% (${a.status === 'PASSED' ? 'өтті' : a.status === 'FAILED' ? 'өтпеді' : a.status})`)
      .join('\n');
    const systemPrompt = `Сен ProctoLearn платформасының AI ассистентісің. Студенттер мен мұғалімдерге оқу процесінде көмектесесің.
Платформада онлайн курстар, сабақтар, прокторингпен емтихандар бар.
Пайдаланушы: ${user?.name ?? 'Белгісіз'} (${user?.role ?? 'STUDENT'})
Жазылған курстар:
${enrollmentList || 'Жоқ'}
Соңғы емтихан нәтижелері:
${attemptList || 'Жоқ'}${courseContext}
Жауап беру ережелері:
1. Тек оқуға байланысты сұрақтарға жауап бер
2. Қысқа және нақты жауап бер (макс 300 сөз)
3. Егер студент емтиханда қиындық сезсе — ынталандыр
4. Қазақша немесе орысша жауап бер (пайдаланушы қай тілде сұраса, сол тілде)
5. Оқуға байланысты емес сұрақтарға: "Бұл сұраққа жауап бере алмаймын, тек оқуға қатысты сұрақтарда көмектесемін" деп жаз`;
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
          max_tokens: 600,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`Groq API error: ${res.status} ${errText}`);
        return { reply: 'Сұрауды өңдеу кезінде қате шықты. Сәл кейін қайталаңыз.' };
      }
      const data: any = await res.json();
      const reply: string = data.choices?.[0]?.message?.content ?? 'Жауап алынбады.';
      return { reply };
    } catch (err) {
      this.logger.error('AI service error', err);
      return { reply: 'AI қызметі қазіргі уақытта қол жетімді емес.' };
    }
  }
}
