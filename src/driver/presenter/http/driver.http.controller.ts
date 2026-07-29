import { JwtGuard } from '@@guards';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateDriverUseCase } from '../../application/use-cases/create-driver.use-case';
import { GetDriversUseCase } from '../../application/use-cases/get-drivers.use-case';
import { UpdateDriverStatusUseCase } from '../../application/use-cases/update-driver-status.use-case';
import { DriverRouter } from './driver.path.presenter';
import { CreateDriverRequestBodyDto, CreateDriverResponseDataDto } from './dto/create-driver.dto';
import { GetDriversRequestQueryDto, GetDriversResponseDataDto } from './dto/get-drivers.dto';
import { UpdateDriverStatusRequestBodyDto, UpdateDriverStatusResponseDataDto } from './dto/update-driver-status.dto';

@ApiTags(DriverRouter.HttpApiTags)
@Controller(DriverRouter.Root)
export class DriverHttpController {
  constructor(
    private readonly createDriverUseCase: CreateDriverUseCase,
    private readonly getDriversUseCase: GetDriversUseCase,
    private readonly updateDriverStatusUseCase: UpdateDriverStatusUseCase,
  ) {}

  /**
   * 기사 신규 등록
   *
   * @param {CreateDriverRequestBodyDto} bodyDto 기사 등록 요청 데이터
   * @returns {Promise<CreateDriverResponseDataDto>} 등록된 기사 정보
   */
  @ApiOperation({ summary: '기사 등록' })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: CreateDriverRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(DriverRouter.Http.Create)
  async createDriver(@Body() bodyDto: CreateDriverRequestBodyDto): Promise<CreateDriverResponseDataDto> {
    return await this.createDriverUseCase.execute({ bodyDto });
  }

  /**
   * status / warehouse 필터로 기사 목록 조회
   *
   * @param {GetDriversRequestQueryDto} queryDto 필터 쿼리
   * @returns {Promise<GetDriversResponseDataDto>} 기사 목록
   */
  @ApiOperation({ summary: '기사 목록 조회 (status/warehouse 필터)' })
  @Get(DriverRouter.Http.GetList)
  async getDrivers(@Query() queryDto: GetDriversRequestQueryDto): Promise<GetDriversResponseDataDto> {
    return await this.getDriversUseCase.execute({ queryDto });
  }

  /**
   * 기사 상태 수동 변경 (OFFLINE ↔ AVAILABLE)
   *
   * @param {number} id 대상 기사 ID
   * @param {UpdateDriverStatusRequestBodyDto} bodyDto 변경할 상태 데이터
   * @returns {Promise<UpdateDriverStatusResponseDataDto>} 변경된 기사 상태
   */
  @ApiOperation({
    summary: '기사 상태 수동 변경 (OFFLINE ↔ AVAILABLE). BUSY는 배차 시스템만 부여.',
  })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: UpdateDriverStatusRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @Patch(DriverRouter.Http.UpdateStatus)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() bodyDto: UpdateDriverStatusRequestBodyDto,
  ): Promise<UpdateDriverStatusResponseDataDto> {
    return await this.updateDriverStatusUseCase.execute({ driverId: id, bodyDto });
  }
}
