// challenges/schemas/challenge.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChallengeDocument = HydratedDocument<Challenge>;

export type ReminderTime = { hh: number; mm: number; text: string };

@Schema({ timestamps: true })
export class Challenge {
  @Prop({ required: true })
  chatId!: number;

  @Prop({ required: true })
  threadId!: number;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: Number, default: null })
  totalDays!: number | null;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true, default: 'active' })
  status!: 'active' | 'completed' | 'failed';

  // ✅ напоминания для этого топика
  @Prop({
    type: [
      {
        hh: { type: Number, required: true },
        mm: { type: Number, required: true },
        text: { type: String, required: true },
      },
    ],
    default: [],
  })
  reminders!: ReminderTime[];
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);
ChallengeSchema.index({ chatId: 1, threadId: 1, status: 1 });
