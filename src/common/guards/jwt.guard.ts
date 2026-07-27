import { AppException, GLOBAL_ERRORS } from '@@exceptions';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisService } from '../redis';

interface JwtPayload {
  sub: number;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: { id: number } }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new AppException(GLOBAL_ERRORS.UNAUTHORIZED);
    }

    const isBlacklisted = await this.redisService.isBlacklisted(token);

    if (isBlacklisted) {
      throw new AppException(GLOBAL_ERRORS.TOKEN_BLACKLISTED);
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new AppException(GLOBAL_ERRORS.UNAUTHORIZED);
    }
  }

  /**
   * Authorization 헤더에서 Bearer 토큰 추출
   *
   * @param {Request} request Express 요청 객체
   * @returns {string | undefined} 토큰 문자열 또는 undefined
   */
  private extractToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const parts = authorization.split(' ');

    return parts[0] === 'Bearer' ? parts[1] : undefined;
  }
}
