import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthListener } from './listeners/auth.listener';
import { EmailModule } from '../../email/email.module';

@Module({
    imports: [
        EventEmitterModule.forRoot({
            global: true,
            wildcard: false,
            maxListeners: 20,
            verboseMemoryLeak: true,
        }),
        EmailModule, // Needed for the AuthListener constructor injection - Because AuthListener is where emails are sent
    ],
    providers: [
        AuthListener, // This is the only provider Nest needs to instantiate
    ],
    exports: []
})
export class EventsModule { }
