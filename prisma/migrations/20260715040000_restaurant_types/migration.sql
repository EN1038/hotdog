-- CreateTable
CREATE TABLE "RestaurantType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantType_code_key" ON "RestaurantType"("code");
