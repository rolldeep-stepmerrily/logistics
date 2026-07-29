import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class PlanRouteRequestBodyDto {
  @ApiPropertyOptional({
    example: ['SEO01', 'DAJ01', 'BSN01'],
    description:
      '경유할 창고 code 배열 (origin 포함, 첫 번째=origin, 마지막=destination의 local hub). 생략 시 routing machine 이 자동 제안.',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  readonly hops?: string[];
}

export class PlanRouteResponseDataDto {
  @ApiProperty({ type: Number })
  readonly shipmentId!: number;

  @ApiProperty({ type: [String] })
  readonly hops!: string[];

  @ApiProperty({ type: Number })
  readonly totalHops!: number;

  @ApiPropertyOptional({ type: Number, description: 'routing machine 이 자동 제안한 경우의 예상 소요 시간(분)' })
  readonly etaMinutes?: number | null;

  @ApiProperty({ type: String, enum: ['manual', 'auto'], description: 'hops 결정 방식' })
  readonly source!: 'manual' | 'auto';

  /**
   * 라우팅 계획 결과로부터 응답 DTO 생성
   *
   * @param {PlanRouteResponseDataDto} data 원본 데이터
   * @returns {PlanRouteResponseDataDto} 매핑된 응답 DTO
   */
  static from(data: PlanRouteResponseDataDto): PlanRouteResponseDataDto {
    return {
      shipmentId: data.shipmentId,
      hops: data.hops,
      totalHops: data.totalHops,
      etaMinutes: data.etaMinutes,
      source: data.source,
    };
  }
}
