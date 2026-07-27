import { HttpStatus } from '@nestjs/common';

export const DRIVER_ERRORS = {
  NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'DRIVER_NOT_FOUND',
    message: 'Driver not found',
  },
  DUPLICATE_PHONE: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'DRIVER_DUPLICATE_PHONE',
    message: 'Driver phone already registered',
  },
  INVALID_STATUS_CHANGE: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'DRIVER_INVALID_STATUS_CHANGE',
    message: 'Driver status change is not allowed',
  },
} as const;
