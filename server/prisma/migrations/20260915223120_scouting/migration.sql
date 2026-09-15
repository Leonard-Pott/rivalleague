-- CreateTable
CREATE TABLE "Scouting" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scouting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scouting_managerId_playerId_key" ON "Scouting"("managerId", "playerId");

-- AddForeignKey
ALTER TABLE "Scouting" ADD CONSTRAINT "Scouting_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scouting" ADD CONSTRAINT "Scouting_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
