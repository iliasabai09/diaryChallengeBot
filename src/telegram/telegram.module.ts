import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiaryUpdate } from './diary.update';
import { ChallengesModule } from '../challenges/challenges.module';
import { FormsModule } from '../forms/forms.module'; // ✅

@Module({
  imports: [
    ChallengesModule,
    FormsModule, // ✅ добавить
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        token: cfg.get<string>('BOT_TOKEN')!,
      }),
    }),
  ],
  providers: [DiaryUpdate],
})
export class TelegramModule {}
