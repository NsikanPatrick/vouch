import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
    (data: keyof any | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            return null;
        }

        // If specific field is requested (e.g., @CurrentUser('id'))
        if (data) {
            return user[data];
        }

        // Return full user object
        return user;
    },
);