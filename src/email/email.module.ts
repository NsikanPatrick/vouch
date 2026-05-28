import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './email.controller';
import { ResendWebhookController } from './resend-webhook.controller';
import { EmailService } from './email.service';
import { EmailLog } from './entities/email-log.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([EmailLog]),
    ConfigModule],
  controllers: [EmailController, ResendWebhookController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule { }