import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InjectModel,
  InjectModel as InjectMongooseModel,
} from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Context } from 'telegraf';
import {
  FormSession,
  FormSessionDocument,
} from './schemas/form-session.schema';
import { ChallengesService } from '../challenges/challenges.service';
import {
  ChallengeEvent,
  ChallengeEventDocument,
} from '../challenges/schemas/challenge-event.schema';

// ---- конфиг формы "Вставать в 4:00" ----
type FormStep =
  | { key: 'wakeTime'; type: 'time'; question: string }
  | {
      key: 'sleepHours';
      type: 'number';
      question: string;
      min?: number;
      max?: number;
    }
  | { key: 'wakeAt4'; type: 'yesno'; question: string }
  | { key: 'energy'; type: 'scale'; question: string; min: number; max: number }
  | {
      key: 'sleepiness';
      type: 'scale';
      question: string;
      min: number;
      max: number;
    }
  | { key: 'morningDone'; type: 'multiline'; question: string }
  | { key: 'thought'; type: 'text'; question: string };

const WAKE_AT_4_FORM: FormStep[] = [
  {
    key: 'wakeTime',
    type: 'time',
    question: '⏰ Во сколько встал? (пример: 04:05)',
  },
  {
    key: 'sleepHours',
    type: 'number',
    question: '🛏 Сколько часов сна? (пример: 6.5)',
    min: 0,
    max: 24,
  },
  { key: 'wakeAt4', type: 'yesno', question: '✅ Подъём в 4:00?' },
  {
    key: 'energy',
    type: 'scale',
    question: '☕ Энергия (1–10)?',
    min: 1,
    max: 10,
  },
  {
    key: 'sleepiness',
    type: 'scale',
    question: '😴 Сонливость (1–10)?',
    min: 1,
    max: 10,
  },
  {
    key: 'morningDone',
    type: 'multiline',
    question:
      '📌 Что сделал утром?\nНапиши списком, каждая строка — отдельный пункт.\nПример:\nнамаз\nзарядка\nчтение',
  },
  { key: 'thought', type: 'text', question: '🧠 Мысль дня? (1–2 предложения)' },
];

function renderWakeAt4Report(params: {
  day: number;
  totalDays: number | null;
  date: Date;
  wakeTime?: string;
  sleepHours?: number;
  wakeAt4?: boolean;
  energy?: number;
  sleepiness?: number;
  morningDone?: string[];
  thought?: string;
}) {
  const dateStr = params.date.toLocaleDateString('ru-RU');
  const dayPart = params.totalDays
    ? `${params.day} / ${params.totalDays}`
    : `${params.day}`;
  const wakeAt4Text =
    params.wakeAt4 === true ? '✔️' : params.wakeAt4 === false ? '❌' : '—';
  const list =
    (params.morningDone ?? []).map((x) => `— ${x}`).join('\n') || '—';

  return (
    `📅 День: ${dayPart}\n` +
    `🗓 Дата: ${dateStr}\n\n` +
    `⏰ Подъём: 04:00 / ${params.wakeTime ?? '—'}\n` +
    `🛏 Сон: ${params.sleepHours ?? '—'} часов\n\n` +
    `✅ Подъём в 4:00: ${wakeAt4Text}\n\n` +
    `🧠 Самочувствие:\n` +
    `☕ Энергия: ${params.energy ?? '—'} /10\n` +
    `😴 Сонливость: ${params.sleepiness ?? '—'} /10\n\n` +
    `📌 Что сделал утром:\n` +
    `${list}\n\n` +
    `🧠 Мысль дня:\n` +
    `${params.thought ?? '—'}`
  );
}

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(FormSession.name)
    private readonly sessionModel: Model<FormSessionDocument>,
    // обновим событие done (meta)
    @InjectMongooseModel(ChallengeEvent.name)
    private readonly eventModel: Model<ChallengeEventDocument>,
    private readonly challenges: ChallengesService,
  ) {}

  // простая проверка, что именно "челлендж вставать в 4"
  isWakeAt4Challenge(title: string) {
    const t = (title || '').toLowerCase();
    return t.includes('04:00') || t.includes('в 4') || t.includes('вставать');
  }

  async startAfterDone(
    ctx: Context,
    params: {
      chatId: number;
      threadId: number;
      userId: number;
      challengeId: Types.ObjectId;
      day: number;
      challengeTitle: string;
      totalDays: number | null;
    },
  ) {
    // запускаем форму только для нужного челленджа
    // if (!this.isWakeAt4Challenge(params.challengeTitle)) return;

    // создаём (или если уже есть — не дублируем)
    let session: FormSessionDocument | null = null;
    try {
      session = await this.sessionModel.create({
        challengeId: params.challengeId,
        chatId: params.chatId,
        threadId: params.threadId,
        userId: params.userId,
        day: params.day,
        stepIndex: 0,
        answers: {},
        status: 'active',
        formKey: 'wakeAt4',
      });
    } catch {
      // уже есть активная сессия на этот день
      session = await this.sessionModel.findOne({
        chatId: params.chatId,
        threadId: params.threadId,
        userId: params.userId,
        day: params.day,
        status: 'active',
      });
    }

    if (!session) return;

    await ctx.reply(
      '📝 Заполним отчёт за день. (Можно отменить: /cancel_form)',
    );
    await this.askCurrentStep(ctx, session);
  }

  async cancel(ctx: Context, chatId: number, threadId: number, userId: number) {
    const session = await this.sessionModel.findOne({
      chatId,
      threadId,
      userId,
      status: 'active',
    });
    if (!session) return ctx.reply('Активной формы нет.');

    session.status = 'cancelled';
    await session.save();

    return ctx.reply('❎ Форма отменена.');
  }

  async onTextAnswer(
    ctx: Context,
    chatId: number,
    threadId: number,
    userId: number,
    text: string,
  ) {
    // игнорируем команды
    if (text.startsWith('/')) return;

    const session = await this.sessionModel.findOne({
      chatId,
      threadId,
      userId,
      status: 'active',
    });
    if (!session) return;

    const steps = WAKE_AT_4_FORM;
    const step = steps[session.stepIndex];
    if (!step) return;

    const value = this.parseTextByStep(step, text);
    session.answers[step.key] = value;
    session.stepIndex += 1;
    await session.save();

    return this.askCurrentStep(ctx, session);
  }

  async onButtonAnswer(
    ctx: Context,
    sessionId: string,
    key: string,
    value: string,
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session || session.status !== 'active') {
      // желательно отвечать на callback, но это сделаем в update
      return null;
    }

    const steps = WAKE_AT_4_FORM;
    const step = steps[session.stepIndex];
    if (!step) return null;

    // защита: кнопка должна отвечать текущему шагу
    if (step.key !== key) return null;

    let parsed: any = value;

    if (step.type === 'yesno') parsed = value === '1';
    if (step.type === 'scale') parsed = Number(value);

    session.answers[step.key] = parsed;
    session.stepIndex += 1;
    await session.save();

    return session;
  }

  private parseTextByStep(step: FormStep, text: string) {
    const raw = text.trim();

    if (step.type === 'time') {
      // 04:05
      if (!/^\d{1,2}:\d{2}$/.test(raw)) {
        throw new BadRequestException(
          'Время должно быть в формате HH:MM (пример 04:05)',
        );
      }
      return raw;
    }

    if (step.type === 'number') {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n))
        throw new BadRequestException('Нужно число. Пример: 6.5');
      if (typeof step.min === 'number' && n < step.min)
        throw new BadRequestException(`Минимум ${step.min}`);
      if (typeof step.max === 'number' && n > step.max)
        throw new BadRequestException(`Максимум ${step.max}`);
      return n;
    }

    if (step.type === 'multiline') {
      return raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // text
    return raw;
  }

  async askCurrentStep(ctx: Context, session: FormSessionDocument) {
    const steps = WAKE_AT_4_FORM;
    const step = steps[session.stepIndex];

    if (!step) {
      // завершение
      await this.finish(ctx, session);
      return;
    }

    // кнопки / текст
    if (step.type === 'yesno') {
      return ctx.reply(step.question, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Да',
                callback_data: `form:${session._id.toString()}:${step.key}:1`,
              },
              {
                text: '❌ Нет',
                callback_data: `form:${session._id.toString()}:${step.key}:0`,
              },
            ],
          ],
        },
      });
    }

    if (step.type === 'scale') {
      const row1: { text: string; callback_data: string }[] = [];
      const row2: { text: string; callback_data: string }[] = [];

      for (let i = step.min; i <= step.max; i++) {
        const btn = {
          text: String(i),
          callback_data: `form:${session._id.toString()}:${step.key}:${i}`,
        };

        if (i <= 5) row1.push(btn);
        else row2.push(btn);
      }

      return ctx.reply(step.question, {
        reply_markup: { inline_keyboard: [row1, row2] },
      });
    }

    // time/number/text/multiline
    return ctx.reply(step.question);
  }

  private async finish(ctx: Context, session: FormSessionDocument) {
    session.status = 'done';
    await session.save();

    // достанем челлендж (чтобы totalDays/название)
    const ch = await this.challenges['challengeModel']
      .findById(session.challengeId)
      .lean(); // быстрый доступ
    const totalDays = (
      typeof ch?.totalDays === 'number' ? ch.totalDays : null
    ) as number | null;

    // ✅ сохраняем meta в событие done этого дня
    await this.eventModel.updateOne(
      { challengeId: session.challengeId, day: session.day, type: 'done' },
      {
        $set: Object.fromEntries(
          Object.entries(session.answers).map(([k, v]) => [`meta.${k}`, v]),
        ),
      },
    );

    // сформировать отчёт
    const a = session.answers;

    const report = renderWakeAt4Report({
      day: session.day,
      totalDays,
      date: new Date(),
      wakeTime: a.wakeTime,
      sleepHours: a.sleepHours,
      wakeAt4: a.wakeAt4,
      energy: a.energy,
      sleepiness: a.sleepiness,
      morningDone: a.morningDone,
      thought: a.thought,
    });

    await ctx.reply('✅ Отчёт сохранён. Вот запись:');
    await ctx.reply(report);
  }
}
