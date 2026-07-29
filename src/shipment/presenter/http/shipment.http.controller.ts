import { User } from '@@decorators';
import { JwtGuard } from '@@guards';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateShipmentUseCase } from '../../application/use-cases/create-shipment.use-case';
import { GetShipmentUseCase } from '../../application/use-cases/get-shipment.use-case';
import { GetShipmentEventsUseCase } from '../../application/use-cases/get-shipment-events.use-case';
import { PlanRouteUseCase } from '../../application/use-cases/plan-route.use-case';
import { TransitionShipmentUseCase } from '../../application/use-cases/transition-shipment.use-case';
import { CreateShipmentRequestBodyDto, CreateShipmentResponseDataDto } from './dto/create-shipment.dto';
import { GetShipmentResponseDataDto } from './dto/get-shipment.dto';
import { GetShipmentEventsResponseDataDto } from './dto/get-shipment-events.dto';
import { PlanRouteRequestBodyDto, PlanRouteResponseDataDto } from './dto/plan-route.dto';
import { TransitionShipmentRequestBodyDto, TransitionShipmentResponseDataDto } from './dto/transition-shipment.dto';
import { ShipmentRouter } from './shipment.path.presenter';

@ApiTags(ShipmentRouter.HttpApiTags)
@Controller(ShipmentRouter.Root)
export class ShipmentHttpController {
  constructor(
    private readonly createShipmentUseCase: CreateShipmentUseCase,
    private readonly getShipmentUseCase: GetShipmentUseCase,
    private readonly getShipmentEventsUseCase: GetShipmentEventsUseCase,
    private readonly transitionShipmentUseCase: TransitionShipmentUseCase,
    private readonly planRouteUseCase: PlanRouteUseCase,
  ) {}

  /**
   * 송장 신규 생성 (초기 상태 CREATED)
   *
   * @param {number} userId 인증된 발송인 ID
   * @param {CreateShipmentRequestBodyDto} bodyDto 송장 생성 요청 데이터
   * @returns {Promise<CreateShipmentResponseDataDto>} 생성된 송장 응답 DTO
   */
  @ApiOperation({ summary: '송장 생성 (초기 상태 CREATED)' })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: CreateShipmentRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(ShipmentRouter.Http.Create)
  async createShipment(
    @User('id') userId: number,
    @Body() bodyDto: CreateShipmentRequestBodyDto,
  ): Promise<CreateShipmentResponseDataDto> {
    return await this.createShipmentUseCase.execute({ senderId: userId, bodyDto });
  }

  /**
   * 송장 단건 조회
   *
   * @param {number} id 조회할 송장 ID
   * @returns {Promise<GetShipmentResponseDataDto>} 송장 상세 응답 DTO
   */
  @ApiOperation({ summary: '송장 단건 조회' })
  @Get(ShipmentRouter.Http.GetOne)
  async getShipment(@Param('id', ParseIntPipe) id: number): Promise<GetShipmentResponseDataDto> {
    return await this.getShipmentUseCase.execute({ shipmentId: id });
  }

  /**
   * 송장의 상태 전이 이력 (event log) 조회
   *
   * @param {number} id 조회할 송장 ID
   * @returns {Promise<GetShipmentEventsResponseDataDto>} 이벤트 목록 응답 DTO
   */
  @ApiOperation({ summary: '송장 상태 전이 이력 조회 (event log)' })
  @Get(ShipmentRouter.Http.GetEvents)
  async getShipmentEvents(@Param('id', ParseIntPipe) id: number): Promise<GetShipmentEventsResponseDataDto> {
    return await this.getShipmentEventsUseCase.execute({ shipmentId: id });
  }

  /**
   * 송장 상태 전이 (XState 이벤트 발행)
   *
   * @param {number} userId 인증된 액터 ID
   * @param {number} id 대상 송장 ID
   * @param {TransitionShipmentRequestBodyDto} bodyDto 전이 이벤트 요청 데이터
   * @returns {Promise<TransitionShipmentResponseDataDto>} 전이 결과 응답 DTO
   */
  @ApiOperation({
    summary: '송장 상태 전이 (state machine event 실행)',
    description: 'XState 머신에 이벤트를 발행해 상태를 전이시킨다. Guard 실패 시 409 INVALID_TRANSITION.',
  })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: TransitionShipmentRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @Post(ShipmentRouter.Http.Transition)
  async transition(
    @User('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() bodyDto: TransitionShipmentRequestBodyDto,
  ): Promise<TransitionShipmentResponseDataDto> {
    return await this.transitionShipmentUseCase.execute({ shipmentId: id, actorId: userId, bodyDto });
  }

  /**
   * 허브 라우팅 계획 설정 (line-haul hop 목록)
   *
   * @param {number} id 대상 송장 ID
   * @param {PlanRouteRequestBodyDto} bodyDto 라우팅 계획 요청 데이터
   * @returns {Promise<PlanRouteResponseDataDto>} 라우팅 계획 응답 DTO
   */
  @ApiOperation({ summary: '허브 라우팅 계획 설정 (line-haul hop 목록)' })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: PlanRouteRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @Post(ShipmentRouter.Http.PlanRoute)
  async planRoute(
    @Param('id', ParseIntPipe) id: number,
    @Body() bodyDto: PlanRouteRequestBodyDto,
  ): Promise<PlanRouteResponseDataDto> {
    return await this.planRouteUseCase.execute({ shipmentId: id, bodyDto });
  }
}
