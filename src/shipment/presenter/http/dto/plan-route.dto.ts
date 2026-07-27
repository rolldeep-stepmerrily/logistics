import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class PlanRouteRequestBodyDto {
  @ApiProperty({
    example: ['SEO01', 'DAJ01', 'BSN01'],
    description: '경유할 창고 code 배열 (origin 포함, 첫 번째=origin, 마지막=destination의 local hub)',
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  readonly hops!: string[];
}

export class PlanRouteResponseDataDto {
  @ApiProperty({ type: Number })
  readonly shipmentId!: number;

  @ApiProperty({ type: [String] })
  readonly hops!: string[];

  @ApiProperty({ type: Number })
  readonly totalHops!: number;
}
