import { HttpStatus } from '@nestjs/common';

export const GLOBAL_ERRORS = {
  CHANGELOG_NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'CHANGELOG_NOT_FOUND',
    message: 'Cannot GET /changelog',
  },
  INVALID_POSITIVE_INT: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'INVALID_POSITIVE_INT',
    message: 'Invalid positive integer',
  },
  UNKNOWN_ERROR: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'UNKNOWN_ERROR',
    message: 'Unknown error',
  },
  DATABASE_ERROR: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'DATABASE_ERROR',
    message: 'Database error',
  },
  UNAUTHORIZED: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'UNAUTHORIZED',
    message: 'Unauthorized',
  },
  TOKEN_BLACKLISTED: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'TOKEN_BLACKLISTED',
    message: 'Token has been revoked',
  },
  REDIS_PIPELINE_NO_RESULTS: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'REDIS_PIPELINE_NO_RESULTS',
    message: 'Redis pipeline returned no results',
  },
} as const;
