import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ShipmentTransitionEventType = {
  RequestPickup: 'REQUEST_PICKUP',
  AssignPickupDriver: 'ASSIGN_PICKUP_DRIVER',
  MarkPickedUp: 'MARK_PICKED_UP',
  ArriveAtOriginHub: 'ARRIVE_AT_ORIGIN_HUB',
  DispatchLineHaul: 'DISPATCH_LINE_HAUL',
  ArriveAtHub: 'ARRIVE_AT_HUB',
  DispatchLastMile: 'DISPATCH_LAST_MILE',
  Deliver: 'DELIVER',
  FailDelivery: 'FAIL_DELIVERY',
  RetryDelivery: 'RETRY_DELIVERY',
  Return: 'RETURN',
  Cancel: 'CANCEL',
} as const;

export type ShipmentTransitionEventType =
  (typeof ShipmentTransitionEventType)[keyof typeof ShipmentTransitionEventType];

export class TransitionPayloadDto {
  @ApiProperty({ example: 3, required: false, description: 'ASSIGN_PICKUP_DRIVER / DISPATCH_LAST_MILE 시 driverId' })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly driverId?: number;

  @ApiProperty({ example: 'https://cdn.example.com/proofs/123.jpg', required: false, description: 'DELIVER 시 증빙 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly proofUrl?: string;

  @ApiProperty({ example: 'ADDRESS_UNREACHABLE', required: false, description: 'FAIL_DELIVERY 시 사유' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly reason?: string;
}

export class TransitionShipmentRequestBodyDto {
  @ApiProperty({
    enum: Object.values(ShipmentTransitionEventType),
    example: ShipmentTransitionEventType.RequestPickup,
    description: 'State machine 이벤트',
  })
  @IsEnum(ShipmentTransitionEventType)
  readonly event!: ShipmentTransitionEventType;

  @ApiProperty({ type: TransitionPayloadDto, required: false })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => TransitionPayloadDto)
  readonly payload?: TransitionPayloadDto;
}

export class TransitionShipmentResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String, description: '이전 상태' })
  readonly previousStatus!: string;

  @ApiProperty({ type: String, description: '전이 후 상태' })
  readonly currentStatus!: string;

  static from(data: TransitionShipmentResponseDataDto): TransitionShipmentResponseDataDto {
    return { id: data.id, previousStatus: data.previousStatus, currentStatus: data.currentStatus };
  }
}
