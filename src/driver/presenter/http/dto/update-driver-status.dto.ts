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
}
