import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { TelegramModule } from './telegram/telegram.module';
import { ChallengesModule } from './challenges/challenges.module';
import { FormsModule } from './forms/forms.module';
import { RemindersModule } from './reminders/reminders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGO_URI'),
      }),
    }),
    ChallengesModule,
    TelegramModule,
    FormsModule,
    FormsModule,
    RemindersModule,
  ],
})
export class AppModule {}
