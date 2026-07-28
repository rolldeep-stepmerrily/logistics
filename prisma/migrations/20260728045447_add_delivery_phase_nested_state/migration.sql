-- CreateEnum
CREATE TYPE "DeliveryPhase" AS ENUM ('EN_ROUTE', 'AT_DOOR');

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "arrivedAtDoorAt" TIMESTAMP(3),
ADD COLUMN     "deliveryPhase" "DeliveryPhase",
ADD COLUMN     "deliveryStartedAt" TIMESTAMP(3);
