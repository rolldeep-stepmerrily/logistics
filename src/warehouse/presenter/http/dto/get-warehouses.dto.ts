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

  /**
   * 창고 엔티티 필드로부터 WarehouseDto 생성
   *
   * @param {WarehouseDto} data 원본 데이터
   * @returns {WarehouseDto} 매핑된 DTO
   */
  static from(data: WarehouseDto): WarehouseDto {
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      address: data.address,
      capacity: data.capacity,
    };
  }
}

export class GetWarehousesResponseDataDto {
  @ApiProperty({ type: [WarehouseDto] })
  readonly warehouses!: WarehouseDto[];

  /**
   * 창고 목록 배열로부터 응답 DTO 생성
   *
   * @param {WarehouseDto[]} warehouses 창고 목록
   * @returns {GetWarehousesResponseDataDto} 매핑된 응답 DTO
   */
  static from(warehouses: WarehouseDto[]): GetWarehousesResponseDataDto {
    return { warehouses: warehouses.map((warehouse) => WarehouseDto.from(warehouse)) };
  }
}
