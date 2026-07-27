export const ShipmentRouter = {
  Root: 'shipments',
  HttpApiTags: 'Shipments',
  Http: {
    Create: '',
    GetList: '',
    GetOne: ':id',
    GetEvents: ':id/events',
    Transition: ':id/transitions',
    PlanRoute: ':id/route-plan',
  },
} as const;
