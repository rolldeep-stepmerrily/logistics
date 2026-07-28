import { Injectable, Logger } from '@nestjs/common';

export interface IRoutingRequest {
  originCode: string;
  destinationCode: string;
}

export interface IRoutingResponse {
  hops: string[];
  etaMinutes: number;
}

/**
 * 외부 라우팅 API stub.
 *
 * 실제 프로덕션에서는 OpenRouteService / Google Directions 같은 API 를 호출하겠지만,
 * 학습 목적이라 in-repo 로 지연 응답을 흉내낸다. XState의 invoke + fromPromise 패턴을 시연하기 위함.
 *
 * 동작:
 *   - 90% 확률로 origin → 가상 midhub (origin + destination 사이) → destination 3-hop 반환
 *   - 10% 확률로 실패 (network error 흉내)
 *   - 300ms 지연으로 실제 API 호출 지연 흉내
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  async suggestRoute(req: IRoutingRequest): Promise<IRoutingResponse> {
    this.logger.log(`Routing request: ${req.originCode} → ${req.destinationCode}`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (Math.random() < 0.1) {
      throw new Error('Upstream routing API temporarily unavailable');
    }

    const midHub = this.deriveMidHubCode(req.originCode, req.destinationCode);
    return {
      hops: [req.originCode, midHub, req.destinationCode],
      etaMinutes: 180 + Math.floor(Math.random() * 60),
    };
  }

  /**
   * 결정론적으로 origin/destination 사이의 가상 mid-hub code 를 만든다.
   * 학습용이라 실제 지리 정보는 무시.
   */
  private deriveMidHubCode(origin: string, destination: string): string {
    const prefix = origin.slice(0, 2);
    const suffix = destination.slice(0, 2);
    return `${prefix}${suffix}00`;
  }
}
