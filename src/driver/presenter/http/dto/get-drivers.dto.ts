import { DriverStatus, VehicleType } from '@@prisma';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class GetDriversRequestQueryDto {
  @ApiProperty({ enum: DriverStatus, required: false })
  @IsOptional()
  @IsEnum(DriverStatus)
  readonly status?: DriverStatus;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly currentWarehouseId?: number;
}

export class DriverDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ enum: VehicleType })
  readonly vehicleType!: VehicleType;

  @ApiProperty({ enum: DriverStatus })
  readonly status!: DriverStatus;

  @ApiProperty({ type: Number, nullable: true })
  readonly currentWarehouseId!: number | null;

  /**
   * 기사 엔티티 필드로부터 DriverDto 생성
   *
   * @param {DriverDto} data 원본 데이터
   * @returns {DriverDto} 매핑된 DTO
   */
  static from(data: DriverDto): DriverDto {
    return {
      id: data.id,
      name: data.name,
      vehicleType: data.vehicleType,
      status: data.status,
      currentWarehouseId: data.currentWarehouseId,
    };
  }
}

export class GetDriversResponseDataDto {
  @ApiProperty({ type: [DriverDto] })
  readonly drivers!: DriverDto[];

  /**
   * 기사 목록 배열로부터 응답 DTO 생성
   *
   * @param {DriverDto[]} drivers 기사 목록
   * @returns {GetDriversResponseDataDto} 매핑된 응답 DTO
   */
  static from(drivers: DriverDto[]): GetDriversResponseDataDto {
    return { drivers: drivers.map((driver) => DriverDto.from(driver)) };
  }
}
