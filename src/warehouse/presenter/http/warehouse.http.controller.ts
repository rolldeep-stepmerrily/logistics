import { JwtGuard } from '@@guards';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateWarehouseUseCase } from '../../application/use-cases/create-warehouse.use-case';
import { GetWarehousesUseCase } from '../../application/use-cases/get-warehouses.use-case';
import { CreateWarehouseRequestBodyDto, CreateWarehouseResponseDataDto } from './dto/create-warehouse.dto';
import { GetWarehousesResponseDataDto } from './dto/get-warehouses.dto';
import { WarehouseRouter } from './warehouse.path.presenter';

@ApiTags(WarehouseRouter.HttpApiTags)
@Controller(WarehouseRouter.Root)
export class WarehouseHttpController {
  constructor(
    private readonly createWarehouseUseCase: CreateWarehouseUseCase,
    private readonly getWarehousesUseCase: GetWarehousesUseCase,
  ) {}

  @ApiOperation({ summary: '창고/허브 생성' })
  @ApiBearerAuth('accessToken')
  @ApiBody({ type: CreateWarehouseRequestBodyDto })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(WarehouseRouter.Http.Create)
  async createWarehouse(@Body() bodyDto: CreateWarehouseRequestBodyDto): Promise<CreateWarehouseResponseDataDto> {
    return await this.createWarehouseUseCase.execute({ bodyDto });
  }

  @ApiOperation({ summary: '창고 목록 조회' })
  @Get(WarehouseRouter.Http.GetList)
  async getWarehouses(): Promise<GetWarehousesResponseDataDto> {
    return await this.getWarehousesUseCase.execute();
  }
}
