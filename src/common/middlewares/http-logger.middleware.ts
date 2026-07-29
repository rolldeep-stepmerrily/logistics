import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDefined } from 'class-validator';

import { NextFunction, Request, Response } from 'express';

interface IRequest extends Request {
  user?: { id: number };
}

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  private readonly logger = new Logger('HTTP');

  /**
   * 모든 HTTP 요청에 대해 완료 시 접근 로그를 출력
   *
   * @param {IRequest} req Express 요청 객체
   * @param {Response} res Express 응답 객체
   * @param {NextFunction} next 다음 미들웨어 함수
   */
  use(req: IRequest, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    if (['local', 'development'].includes(this.configService.getOrThrow('NODE_ENV'))) {
      this.logger.debug(`Body: ${JSON.stringify(req.body)}`);
    }

    res.on('finish', () => {
      const userIpV4 = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown';
      const userIpV6 = req.ips.length > 0 ? req.ips[0] : (req.ip ?? 'unknown');
      const userId = isDefined(req.user?.id) ? ` ${req.user.id} ` : ' ';
      const contentLength = res.getHeader('content-length') ?? 0;
      const referrer = req.header('Referer') ?? req.header('Referrer');
      const formattedReferrer = isDefined(referrer) ? ` "${referrer}" ` : ' ';
      const userAgent = req.header('user-agent');
      const responseTime = Date.now() - startTime;

      const message = `[${userIpV4} | ${userIpV6}] -${userId}"${req.method} ${req.originalUrl} HTTP/${req.httpVersion}" ${res.statusCode} - ${contentLength}${formattedReferrer}"${userAgent}" \x1b[33m+${responseTime}ms`;

      if (res.statusCode >= 400) {
        this.logger.error(message);

        return;
      }

      this.logger.log(message);
    });

    next();
  }
}
