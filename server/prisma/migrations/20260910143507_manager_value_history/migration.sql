-- CreateTable
CREATE TABLE "ManagerValue" (
    "id" SERIAL NOT NULL,
    "managerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "teamValue" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,

    CONSTRAINT "ManagerValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagerValue_managerId_date_key" ON "ManagerValue"("managerId", "date");

-- AddForeignKey
ALTER TABLE "ManagerValue" ADD CONSTRAINT "ManagerValue_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
