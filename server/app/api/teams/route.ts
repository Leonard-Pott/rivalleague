import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";

/** Alle Vereine der Liga, fuer die Wahl des Lieblingsvereins. */
export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, logoUrl: true },
  });
  return { teams };
});
