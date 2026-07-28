import { HttpStatus } from '@nestjs/common';

export const SHIPMENT_ERRORS = {
  NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'SHIPMENT_NOT_FOUND',
    message: 'Shipment not found',
  },
  INVALID_TRANSITION: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'SHIPMENT_INVALID_TRANSITION',
    message: 'State transition is not allowed from the current status',
  },
  ORIGIN_EQUALS_DESTINATION: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'SHIPMENT_ORIGIN_EQUALS_DESTINATION',
    message: 'Origin hub and destination hub must differ',
  },
  ROUTE_NOT_PLANNED: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'SHIPMENT_ROUTE_NOT_PLANNED',
    message: 'Cannot dispatch line haul before a route plan exists',
  },
  DRIVER_NOT_AVAILABLE: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'SHIPMENT_DRIVER_NOT_AVAILABLE',
    message: 'Driver is not available for assignment',
  },
  DELIVERY_PROOF_REQUIRED: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'SHIPMENT_DELIVERY_PROOF_REQUIRED',
    message: 'Delivery proof is required to mark shipment as delivered',
  },
  ROUTING_FAILED: {
    statusCode: HttpStatus.BAD_GATEWAY,
    errorCode: 'SHIPMENT_ROUTING_FAILED',
    message: 'Routing service failed to suggest a route',
  },
  PAYMENT_AMOUNT_REQUIRED: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'SHIPMENT_PAYMENT_AMOUNT_REQUIRED',
    message: 'Payment amount is required to confirm payment',
  },
} as const;
