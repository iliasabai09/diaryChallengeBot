// reminders/reminders.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RemindersService } from './reminders.service';
import {
  Challenge,
  ChallengeSchema,
} from '../challenges/schemas/challenge.schema';
import {
  ChallengeEvent,
  ChallengeEventSchema,
} from '../challenges/schemas/challenge-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeEvent.name, schema: ChallengeEventSchema },
    ]),
  ],
  providers: [RemindersService],
})
export class RemindersModule {}
