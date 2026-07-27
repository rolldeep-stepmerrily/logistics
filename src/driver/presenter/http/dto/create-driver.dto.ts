import { VehicleType } from '@@prisma';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDriverRequestBodyDto {
  @ApiProperty({ example: '김기사' })
  @IsString()
  @MaxLength(30)
  readonly name!: string;

  @ApiProperty({ example: '010-9999-1234' })
  @IsString()
  @MaxLength(20)
  readonly phone!: string;

  @ApiProperty({ enum: VehicleType, example: VehicleType.CAR })
  @IsEnum(VehicleType)
  readonly vehicleType!: VehicleType;

  @ApiProperty({ example: 1, description: '초기 소속 창고 ID', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly currentWarehouseId?: number;
}

export class CreateDriverResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly name!: string;
}
