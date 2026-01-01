import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FormSession, FormSessionSchema } from './schemas/form-session.schema';
import { FormsService } from './forms.service';

import {
  ChallengeEvent,
  ChallengeEventSchema,
} from '../challenges/schemas/challenge-event.schema';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [
    ChallengesModule,
    MongooseModule.forFeature([
      { name: FormSession.name, schema: FormSessionSchema },
      { name: ChallengeEvent.name, schema: ChallengeEventSchema },
    ]),
  ],
  providers: [FormsService],
  exports: [FormsService], // ✅ обязательно
})
export class FormsModule {}
