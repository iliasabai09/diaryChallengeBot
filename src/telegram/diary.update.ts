import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { ChallengesService } from '../challenges/challenges.service';

@Update()
export class DiaryUpdate {
  constructor(
    private readonly cfg: ConfigService,
    private readonly challenges: ChallengesService,
  ) {}

  private isAllowedChat(chatId: number) {
    const allowed = this.cfg.get<string>('ALLOWED_CHAT_ID');
    if (!allowed) return true;
    return String(chatId) === String(allowed);
  }

  private getThreadId(ctx: Context): number | undefined {
    return (ctx.message as any)?.message_thread_id as number | undefined;
  }

  private async ensureThreadChallenge(ctx: Context) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const threadId = this.getThreadId(ctx);

    if (!chatId || !userId) return null;

    if (!this.isAllowedChat(chatId)) {
      await ctx.reply('⛔ Этот бот настроен для другого чата.');
      return null;
    }

    if (!threadId) {
      await ctx.reply('⚠️ Напиши команду внутри темы (топика) челленджа.');
      return null;
    }

    const challenge = await this.challenges.getOrCreateByThread(
      chatId,
      threadId,
    );
    return { chatId, userId, threadId, challenge };
  }

  private autoDeleteMessage(
    ctx: Context,
    messageId?: number,
    ttlMs = 60 * 60 * 1000,
  ) {
    const chatId = ctx.chat?.id;
    if (!chatId || !messageId) return;

    setTimeout(() => {
      try {
        ctx.telegram.deleteMessage(chatId, messageId);
      } catch {
        // нет прав / уже удалено — игнор
      }
    }, ttlMs);
  }

  // ✅ DONE
  @Command('done')
  async done(@Ctx() ctx: Context) {
    const data = await this.ensureThreadChallenge(ctx);
    if (!data) return;

    try {
      const res = await this.challenges.markByChallenge(
        data.challenge._id,
        data.userId,
        'done',
      );

      const st = await this.challenges.statusByChallenge(data.challenge._id);
      const botMsg = await ctx.reply(
        `✅ День ${res.day} выполнен\n` +
          `🔥 Серия: ${st?.streak ?? 0}\n` +
          `🏁 Выполнено: ${st?.doneCount ?? 0}/${st?.totalDays ?? 0}`,
      );
      this.autoDeleteMessage(ctx, ctx.message?.message_id, 60 * 1000);
      this.autoDeleteMessage(ctx, botMsg.message_id, 60 * 1000);
    } catch (e: any) {
      return ctx.reply(`⚠️ ${e?.message ?? 'Ошибка'}`);
    }
  }

  // ❌ MISS
  @Command('miss')
  async miss(@Ctx() ctx: Context) {
    const data = await this.ensureThreadChallenge(ctx);
    if (!data) return;

    try {
      const res = await this.challenges.markByChallenge(
        data.challenge._id,
        data.userId,
        'miss',
      );

      const st = await this.challenges.statusByChallenge(data.challenge._id);

      const botMsg = await ctx.reply(
        `❌ День ${res.day} пропущен\n` +
          `📉 Пропусков: ${st?.missCount ?? 0}\n` +
          `🏁 Выполнено: ${st?.doneCount ?? 0}/${st?.totalDays ?? 0}`,
      );
      this.autoDeleteMessage(ctx, ctx.message?.message_id, 60 * 1000);
      this.autoDeleteMessage(ctx, botMsg.message_id, 60 * 1000);
    } catch (e: any) {
      return ctx.reply(`⚠️ ${e?.message ?? 'Ошибка'}`);
    }
  }

  // 📊 STATUS — как ты просил
  @Command('status')
  async status(@Ctx() ctx: Context) {
    const data = await this.ensureThreadChallenge(ctx);
    if (!data) return;

    const st = await this.challenges.statusByChallenge(data.challenge._id);
    if (!st) return ctx.reply('Нет активного челленджа в этой теме.');

    const botMsg = await ctx.reply(
      `📊 Челлендж «${st.title}»\n\n` +
        `📅 Сегодня: День ${st.today}\n` +
        `✔ Выполнено: ${st.doneCount}\n` +
        `❌ Пропущено: ${st.missCount}\n` +
        `🔥 Серия: ${st.streak}\n` +
        `🏆 Лучшая серия: ${st.bestStreak}`,
    );
    this.autoDeleteMessage(ctx, ctx.message?.message_id, 60 * 1000);
    this.autoDeleteMessage(ctx, botMsg.message_id, 60 * 1000);
  }

  // 📈 ANALYTICS (оставляем)
  @Command('analytics')
  async analytics(@Ctx() ctx: Context) {
    const data = await this.ensureThreadChallenge(ctx);
    if (!data) return;

    const a = await this.challenges.analyticsByChallenge(data.challenge._id);
    if (!a) return ctx.reply('Нет активного челленджа в этой теме.');

    const completionText =
      typeof a.completion === 'number' ? `${a.completion}%` : '—';
    const botMsg = await ctx.reply(
      `📈 АНАЛИТИКА\n\n` +
        `• Выполнение: ${completionText}\n` +
        `• Серия: ${a.streak} (лучшая ${a.bestStreak})\n` +
        `• Пропусков: ${a.missCount}\n` +
        `• Прогноз завершения: ${a.forecast}%`,
    );
    this.autoDeleteMessage(ctx, ctx.message?.message_id, 60 * 1000);
    this.autoDeleteMessage(ctx, botMsg.message_id, 60 * 1000);
  }
}
