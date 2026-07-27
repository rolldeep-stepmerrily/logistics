import { GLOBAL_ERRORS } from '@@exceptions';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

interface IErrorResponse {
  message: string;
  errorCode?: string;
  [key: string]: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { statusCode, errorCode, message } = this.resolveError(exception);

    response.status(statusCode).json({ statusCode, errorCode, message });
  }

  /**
   * 예외를 SPEC 응답 형식 { statusCode, errorCode, message }로 변환
   *
   * @param {unknown} exception 처리할 예외
   * @returns {{ statusCode: number; errorCode: string; message: string }} 정규화된 에러 응답
   */
  private resolveError(exception: unknown): { statusCode: number; errorCode: string; message: string } {
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    if (this.isPrismaKnownError(exception)) {
      this.logger.error(`Prisma error code=${exception.code}: ${exception.message ?? ''}`);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: GLOBAL_ERRORS.DATABASE_ERROR.errorCode,
        message: GLOBAL_ERRORS.DATABASE_ERROR.message,
      };
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: GLOBAL_ERRORS.UNKNOWN_ERROR.errorCode,
      message: GLOBAL_ERRORS.UNKNOWN_ERROR.message,
    };
  }

  /**
   * HttpException을 정규화된 에러 응답으로 변환
   *
   * @param {HttpException} exception HTTP 예외
   * @returns {{ statusCode: number; errorCode: string; message: string }} 정규화된 에러 응답
   */
  private resolveHttpException(exception: HttpException): { statusCode: number; errorCode: string; message: string } {
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const error: IErrorResponse =
      typeof exceptionResponse === 'string' ? { message: exceptionResponse } : (exceptionResponse as IErrorResponse);

    const errorCodeByStatus: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.BAD_REQUEST]: 'INVALID_REQUEST',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    };

    const errorCode = error.errorCode ?? errorCodeByStatus[statusCode] ?? 'UNDEFINED_ERROR_CODE';

    const messageByStatus: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests. Please try again later.',
    };

    const message = messageByStatus[statusCode] ?? error.message ?? 'UNDEFINED_ERROR_MESSAGE';

    return { statusCode, errorCode, message };
  }

  /**
   * Prisma의 known request error 여부 판별 (duck typing — runtime import 의존성 회피)
   *
   * @param {unknown} exception 검사할 예외
   * @returns {boolean} Prisma 에러 여부
   */
  private isPrismaKnownError(exception: unknown): exception is { code: string; message?: string } {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as { code: unknown }).code === 'string' &&
      (exception as { code: string }).code.startsWith('P')
    );
  }
}
