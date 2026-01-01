import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Challenge, ChallengeDocument } from './schemas/challenge.schema';
import {
  ChallengeEvent,
  ChallengeEventDocument,
} from './schemas/challenge-event.schema';

@Injectable()
export class ChallengesService {
  constructor(
    @InjectModel(Challenge.name)
    private readonly challengeModel: Model<ChallengeDocument>,
    @InjectModel(ChallengeEvent.name)
    private readonly eventModel: Model<ChallengeEventDocument>,
  ) {}

  // день 1 = дата старта
  private calcDayNumber(startDate: Date, now = new Date()): number {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const cur = new Date(now);
    cur.setHours(0, 0, 0, 0);

    const diff = Math.floor(
      (cur.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff + 1;
  }

  // "ВСТАВАТЬ В 04:00 / 40 дней" -> { title, totalDays }
  private parseTopicTitle(name: string): {
    title?: string;
    totalDays?: number;
  } {
    const cleaned = (name ?? '').trim();
    const m = cleaned.match(/(.+?)\s*\/\s*(\d+)\s*(дн(ей|я)|days)?/i);
    if (!m) return { title: cleaned || undefined };
    return { title: m[1].trim(), totalDays: Number(m[2]) };
  }

  /**
   * Получить или создать челлендж по теме (топику) группы
   * Идентификатор челленджа: (chatId + threadId)
   */
  async getOrCreateByThread(
    chatId: number,
    threadId: number,
    titleFromTopic?: string,
  ) {
    if (!chatId || !threadId) {
      throw new BadRequestException('chatId/threadId обязательны');
    }

    let ch = await this.challengeModel.findOne({
      chatId,
      threadId,
      status: 'active',
    });
    if (ch) return ch;

    const parsed = this.parseTopicTitle(titleFromTopic ?? '');

    ch = await this.challengeModel.create({
      chatId,
      threadId,
      title: parsed.title || titleFromTopic || `Topic ${threadId}`,
      totalDays: parsed.totalDays ?? null,
      startDate: new Date(),
      status: 'active',
    });

    return ch;
  }

  /**
   * Отметка дня (done/miss) в рамках конкретного челленджа
   */
  async markByChallenge(
    challengeId: Types.ObjectId | string,
    userId: number,
    type: 'done' | 'miss',
  ) {
    const ch = await this.challengeModel.findById(challengeId).lean();
    if (!ch) throw new BadRequestException('Челлендж не найден');
    if (ch.status !== 'active')
      throw new BadRequestException('Челлендж не активен');

    const day = this.calcDayNumber(ch.startDate);

    if (day < 1) throw new BadRequestException('Некорректный день');

    // если totalDays задан и день вышел за рамки — закрываем и ругаемся
    if (
      typeof ch.totalDays === 'number' &&
      ch.totalDays > 0 &&
      day > ch.totalDays
    ) {
      await this.challengeModel.updateOne(
        { _id: ch._id },
        { $set: { status: 'completed' } },
      );
      throw new BadRequestException(
        'Челлендж уже должен быть завершён (дней больше лимита).',
      );
    }

    // Пишем событие. Unique index на (challengeId, day, type) или (challengeId, day)
    // защитит от повторной отметки.
    await this.eventModel.create({
      challengeId: new Types.ObjectId(ch._id),
      chatId: ch.chatId,
      threadId: ch.threadId,
      userId,
      type,
      day,
    });

    // автозавершение если последний день done
    if (
      type === 'done' &&
      typeof ch.totalDays === 'number' &&
      day === ch.totalDays
    ) {
      await this.challengeModel.updateOne(
        { _id: ch._id },
        { $set: { status: 'completed' } },
      );
    }

    return { day };
  }

  /**
   * Статус по конкретному челленджу
   * (без привязки к userId — по факту челленджа)
   */
  async statusByChallenge(challengeId: Types.ObjectId | string) {
    const ch = await this.challengeModel.findById(challengeId).lean();
    if (!ch) return null;

    const events = await this.eventModel
      .find({
        challengeId: ch._id,
        type: { $in: ['done', 'miss'] },
      })
      .lean();

    const doneDays = new Set(
      events.filter((e) => e.type === 'done').map((e) => e.day),
    );
    const missDays = new Set(
      events.filter((e) => e.type === 'miss').map((e) => e.day),
    );

    const today = this.calcDayNumber(ch.startDate);

    const doneCount = doneDays.size;
    const missCount = missDays.size;

    // streak: считаем назад от today пока день done
    let streak = 0;
    for (let d = today; d >= 1; d--) {
      if (doneDays.has(d)) streak++;
      else break;
    }

    // best streak
    const maxDay =
      typeof ch.totalDays === 'number' && ch.totalDays > 0
        ? Math.min(today, ch.totalDays)
        : today;

    let best = 0;
    let cur = 0;
    for (let d = 1; d <= maxDay; d++) {
      if (doneDays.has(d)) {
        cur++;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }

    const totalDays = typeof ch.totalDays === 'number' ? ch.totalDays : 0;

    return {
      title: ch.title,
      totalDays, // если 0 => неизвестно/не задано
      today,
      doneCount,
      missCount,
      streak,
      bestStreak: best,
      left: totalDays > 0 ? Math.max(totalDays - doneCount, 0) : null,
    };
  }

  /**
   * Удобный статус по thread (когда ты в хэндлере знаешь chatId+threadId)
   */
  async statusByThread(chatId: number, threadId: number) {
    const ch = await this.challengeModel
      .findOne({ chatId, threadId, status: 'active' })
      .lean();
    if (!ch) return null;
    return this.statusByChallenge(ch._id);
  }

  async analyticsByChallenge(challengeId: Types.ObjectId | string) {
    const st = await this.statusByChallenge(challengeId);
    if (!st) return null;

    const completion =
      st.totalDays > 0 ? Math.round((st.doneCount / st.totalDays) * 100) : null;

    const forecast = Math.min(
      95,
      Math.max(10, 40 + st.streak * 8 - st.missCount * 10),
    );

    return {
      ...st,
      completion,
      forecast,
    };
  }

  async analyticsByThread(chatId: number, threadId: number) {
    const ch = await this.challengeModel
      .findOne({ chatId, threadId, status: 'active' })
      .lean();
    if (!ch) return null;
    return this.analyticsByChallenge(ch._id);
  }

  /**
   * (Опционально) список всех активных челленджей группы
   */
  async listActiveByChat(chatId: number) {
    return this.challengeModel
      .find({ chatId, status: 'active' })
      .sort({ createdAt: -1 })
      .lean();
  }
}
