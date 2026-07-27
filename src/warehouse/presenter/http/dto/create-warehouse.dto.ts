import { WarehouseType } from '@@prisma';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateWarehouseRequestBodyDto {
  @ApiProperty({ example: 'SEO01', description: '창고 코드' })
  @IsString()
  @MaxLength(20)
  readonly code!: string;

  @ApiProperty({ example: '서울 강남 허브' })
  @IsString()
  @MaxLength(50)
  readonly name!: string;

  @ApiProperty({ enum: WarehouseType, example: WarehouseType.HUB })
  @IsEnum(WarehouseType)
  readonly type!: WarehouseType;

  @ApiProperty({ example: '서울시 강남구 테헤란로 1' })
  @IsString()
  @MaxLength(200)
  readonly address!: string;

  @ApiProperty({ example: 37.4979 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  readonly latitude!: number;

  @ApiProperty({ example: 127.0276 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  readonly longitude!: number;

  @ApiProperty({ example: 10000, description: '수용 물동량' })
  @IsInt()
  @Min(1)
  readonly capacity!: number;
}

export class CreateWarehouseResponseDataDto {
  @ApiProperty({ type: Number })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly code!: string;
}
