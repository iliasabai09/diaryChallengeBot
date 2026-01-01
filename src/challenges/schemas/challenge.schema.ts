import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChallengeDocument = HydratedDocument<Challenge>;

@Schema({ timestamps: true })
export class Challenge {
  // Группа (DIARY)
  @Prop({ required: true })
  chatId!: number;

  // Тема (топик) внутри группы — КЛЮЧЕВОЕ ПОЛЕ
  @Prop({ required: true })
  threadId!: number;

  // Название челленджа (обычно из названия топика)
  @Prop({ required: true })
  title!: string;

  // Сколько дней (может быть null, если не указано "/ 40 дней")
  @Prop({ type: Number, required: false, min: 1, default: null })
  totalDays!: number | null;

  // Дата старта (первый /done или создание)
  @Prop({ required: true })
  startDate!: Date;

  // Статус челленджа
  @Prop({ required: true, default: 'active' })
  status!: 'active' | 'completed' | 'failed';
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);

/**
 * В одной группе один активный челлендж на один топик
 */
ChallengeSchema.index({ chatId: 1, threadId: 1, status: 1 }, { unique: true });
