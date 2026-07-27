import { HttpStatus } from '@nestjs/common';

export const WAREHOUSE_ERRORS = {
  NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'WAREHOUSE_NOT_FOUND',
    message: 'Warehouse not found',
  },
  DUPLICATE_CODE: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'WAREHOUSE_DUPLICATE_CODE',
    message: 'Warehouse code already exists',
  },
} as const;
