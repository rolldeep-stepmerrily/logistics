import { ApiProperty } from '@nestjs/swagger';

export class GetShipmentResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly trackingNumber!: string;

  @ApiProperty({ type: String })
  readonly status!: string;

  @ApiProperty({ type: String, description: 'payment 서브머신 상태' })
  readonly paymentStatus!: string;

  @ApiProperty({ type: Number, nullable: true, description: '결제 금액 (원)' })
  readonly paidAmount!: number | null;

  @ApiProperty({ type: String })
  readonly recipientName!: string;

  @ApiProperty({ type: String })
  readonly recipientAddr!: string;

  @ApiProperty({ type: Number })
  readonly originHubId!: number;

  @ApiProperty({ type: Number })
  readonly destinationHubId!: number;

  @ApiProperty({ type: Number, nullable: true })
  readonly currentHubId!: number | null;

  @ApiProperty({ type: Date })
  readonly createdAt!: Date;
}

export class GetShipmentEventDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String, nullable: true })
  readonly fromStatus!: string | null;

  @ApiProperty({ type: String })
  readonly toStatus!: string;

  @ApiProperty({ type: String })
  readonly eventType!: string;

  @ApiProperty({ type: Date })
  readonly occurredAt!: Date;
}

export class GetShipmentEventsResponseDataDto {
  @ApiProperty({ type: [GetShipmentEventDto] })
  readonly events!: GetShipmentEventDto[];
}
