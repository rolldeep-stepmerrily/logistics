import { DriverStatus } from '@@prisma';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateDriverStatusRequestBodyDto {
  @ApiProperty({ enum: DriverStatus, example: DriverStatus.AVAILABLE })
  @IsEnum(DriverStatus)
  readonly status!: DriverStatus;
}

export class UpdateDriverStatusResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ enum: DriverStatus })
  readonly status!: DriverStatus;

  /**
   * 변경된 기사 상태로부터 응답 DTO 생성
   *
   * @param {UpdateDriverStatusResponseDataDto} data 응답 원본 데이터
   * @returns {UpdateDriverStatusResponseDataDto} 매핑된 응답 DTO
   */
  static from(data: UpdateDriverStatusResponseDataDto): UpdateDriverStatusResponseDataDto {
    return { id: data.id, status: data.status };
  }
}
