import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChallengesService } from './challenges.service';
import { Challenge, ChallengeSchema } from './schemas/challenge.schema';
import {
  ChallengeEvent,
  ChallengeEventSchema,
} from './schemas/challenge-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeEvent.name, schema: ChallengeEventSchema },
    ]),
  ],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
