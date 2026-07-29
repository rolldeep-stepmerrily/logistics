import { ApiProperty } from '@nestjs/swagger';

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

  /**
   * ShipmentEvent 레코드로부터 이벤트 DTO 생성
   *
   * @param {GetShipmentEventDto} data 원본 데이터
   * @returns {GetShipmentEventDto} 매핑된 DTO
   */
  static from(data: GetShipmentEventDto): GetShipmentEventDto {
    return {
      id: data.id,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      eventType: data.eventType,
      occurredAt: data.occurredAt,
    };
  }
}

export class GetShipmentEventsResponseDataDto {
  @ApiProperty({ type: [GetShipmentEventDto] })
  readonly events!: GetShipmentEventDto[];

  /**
   * 이벤트 배열로부터 응답 DTO 생성
   *
   * @param {GetShipmentEventDto[]} events 이벤트 목록
   * @returns {GetShipmentEventsResponseDataDto} 매핑된 응답 DTO
   */
  static from(events: GetShipmentEventDto[]): GetShipmentEventsResponseDataDto {
    return { events: events.map((event) => GetShipmentEventDto.from(event)) };
  }
}
