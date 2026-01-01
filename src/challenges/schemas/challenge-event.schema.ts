import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChallengeEventDocument = HydratedDocument<ChallengeEvent>;

@Schema({ timestamps: true })
export class ChallengeEvent {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true })
  challengeId!: Types.ObjectId;

  @Prop({ required: true })
  userId!: number;

  @Prop({ required: true })
  chatId!: number;

  @Prop({ required: true })
  threadId!: number;

  @Prop({ required: true, enum: ['done', 'miss'] })
  type!: 'done' | 'miss';

  @Prop({ required: true, min: 1 })
  day!: number;

  @Prop()
  note?: string;

  // ✅ ответы формы/поля дня
  @Prop({ type: Object, required: false, default: {} })
  meta?: Record<string, any>;
}

export const ChallengeEventSchema =
  SchemaFactory.createForClass(ChallengeEvent);

// ✅ 1 отметка в день
ChallengeEventSchema.index({ challengeId: 1, day: 1 }, { unique: true });
