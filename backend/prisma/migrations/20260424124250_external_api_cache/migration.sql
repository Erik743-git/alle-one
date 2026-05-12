-- CreateTable
CREATE TABLE "external_api_cache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_api_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_api_cache_cache_key_key" ON "external_api_cache"("cache_key");

-- CreateIndex
CREATE INDEX "external_api_cache_provider_idx" ON "external_api_cache"("provider");

-- CreateIndex
CREATE INDEX "external_api_cache_expires_at_idx" ON "external_api_cache"("expires_at");
