import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateShipmentRequestBodyDto {
  @ApiProperty({ example: '홍길동', description: '수취인 이름' })
  @IsString()
  @MaxLength(30)
  readonly recipientName!: string;

  @ApiProperty({ example: '010-1234-5678', description: '수취인 연락처' })
  @IsString()
  @MaxLength(20)
  readonly recipientPhone!: string;

  @ApiProperty({ example: '서울시 강남구 테헤란로 1', description: '수취 주소' })
  @IsString()
  @MaxLength(200)
  readonly recipientAddr!: string;

  @ApiProperty({ example: 1, description: '출발 허브(창고) ID' })
  @IsInt()
  @Min(1)
  readonly originHubId!: number;

  @ApiProperty({ example: 2, description: '도착 허브(창고) ID' })
  @IsInt()
  @Min(1)
  readonly destinationHubId!: number;

  @ApiProperty({ example: 1500, description: '무게 (g)' })
  @IsInt()
  @Min(1)
  readonly weightG!: number;

  @ApiProperty({ example: 50000, description: '신고 가액 (원)', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly declaredValue?: number;
}

export class CreateShipmentResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String, description: '송장 번호 (WP-XXXXXXXX)' })
  readonly trackingNumber!: string;

  @ApiProperty({ type: String, description: '현재 상태 (초기 = CREATED)' })
  readonly status!: string;

  /**
   * 생성된 송장 요약으로부터 응답 DTO 생성
   *
   * @param {CreateShipmentResponseDataDto} data 원본 데이터
   * @returns {CreateShipmentResponseDataDto} 매핑된 응답 DTO
   */
  static from(data: CreateShipmentResponseDataDto): CreateShipmentResponseDataDto {
    return { id: data.id, trackingNumber: data.trackingNumber, status: data.status };
  }
}
