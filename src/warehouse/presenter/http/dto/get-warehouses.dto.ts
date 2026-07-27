import { WarehouseType } from '@@prisma';
import { ApiProperty } from '@nestjs/swagger';

export class WarehouseDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly code!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ enum: WarehouseType })
  readonly type!: WarehouseType;

  @ApiProperty({ type: String })
  readonly address!: string;

  @ApiProperty({ type: Number })
  readonly capacity!: number;
}

export class GetWarehousesResponseDataDto {
  @ApiProperty({ type: [WarehouseDto] })
  readonly warehouses!: WarehouseDto[];
}
