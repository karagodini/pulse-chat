import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { id: string; email: string };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
