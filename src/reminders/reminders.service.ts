import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

import {
  Challenge,
  ChallengeDocument,
} from '../challenges/schemas/challenge.schema';
import {
  ChallengeEvent,
  ChallengeEventDocument,
} from '../challenges/schemas/challenge-event.schema';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectModel(Challenge.name)
    private readonly challengeModel: Model<ChallengeDocument>,
    @InjectModel(ChallengeEvent.name)
    private readonly eventModel: Model<ChallengeEventDocument>,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  private toAlmaty(now: Date) {
    // Railway/сервер может быть UTC — переводим в Алматы (UTC+5)
    const ms = now.getTime() + 5 * 60 * 60 * 1000;
    // const ms = now.getTime();
    return new Date(ms);
  }

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  @Cron(CronExpression.EVERY_MINUTE) // ✅ каждую минуту
  async tick() {
    const nowLocal = this.toAlmaty(new Date());
    const hh = nowLocal.getHours();
    const mm = nowLocal.getMinutes();

    // 1) берём активные челленджи, у которых есть напоминания на это время
    const challenges = await this.challengeModel
      .find({
        status: 'active',
        reminders: { $elemMatch: { hh, mm } },
      })
      .lean();
    if (!challenges.length) return;

    const todayStart = this.startOfDay(nowLocal);
    for (const ch of challenges) {
      try {
        // 2) проверяем: был ли done сегодня по этому челленджу
        const doneToday = await this.eventModel.exists({
          challengeId: ch._id,
          type: 'done',
          createdAt: { $gte: todayStart },
        });
        if (doneToday) continue;
        // 3) берём текст напоминания (можно несколько — отправим все)
        const texts = (ch.reminders ?? [])
          .filter((r) => r.hh === hh && r.mm === mm)
          .map((r) => r.text);
        for (const t of texts) {
          const msg = await this.bot.telegram.sendMessage(
            ch.chatId,
            `⏰ Напоминание: ${t}\n\nОтметь: /done`,
            {
              message_thread_id: ch.threadId, // отправка в топик
            },
          );

          // автоочистка через 1 час
          setTimeout(
            () => {
              try {
                this.bot.telegram.deleteMessage(ch.chatId, msg.message_id);
              } catch (e: any) {}
            },
            60 * 60 * 1000,
          ); // 1 час
        }
      } catch (e: any) {
        this.logger.error(
          `Reminder failed for ch=${String(ch._id)}: ${e?.message ?? e}`,
        );
      }
    }
  }
}
