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
}

export class GetDriversResponseDataDto {
  @ApiProperty({ type: [DriverDto] })
  readonly drivers!: DriverDto[];
}
