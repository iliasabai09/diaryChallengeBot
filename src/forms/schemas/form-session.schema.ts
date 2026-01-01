import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FormSessionDocument = HydratedDocument<FormSession>;

@Schema({ timestamps: true })
export class FormSession {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true })
  challengeId!: Types.ObjectId;

  @Prop({ required: true })
  chatId!: number;

  @Prop({ required: true })
  threadId!: number;

  @Prop({ required: true })
  userId!: number;

  @Prop({ required: true, min: 1 })
  day!: number;

  @Prop({ required: true, default: 0 })
  stepIndex!: number;

  @Prop({ type: Object, required: true, default: {} })
  answers!: Record<string, any>;

  @Prop({
    required: true,
    default: 'active',
    enum: ['active', 'done', 'cancelled'],
  })
  status!: 'active' | 'done' | 'cancelled';

  @Prop({ required: true })
  formKey!: string; // например 'wakeAt4'
}

export const FormSessionSchema = SchemaFactory.createForClass(FormSession);

// Один активный опрос на пользователя в конкретном топике и дне
FormSessionSchema.index(
  { chatId: 1, threadId: 1, userId: 1, day: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
