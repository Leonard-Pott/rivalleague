import { prisma } from "./db";

export type ActiveMatchday = {
  matchday: number;
  /** Anpfiff des ersten Spiels - bis dahin kann aufgestellt werden. */
  deadline: Date | null;
  /** Ab dem ersten Anpfiff ist die Aufstellung eingefroren. */
  locked: boolean;
};

/**
 * Der Spieltag, um den es gerade geht: der frueheste, der noch nicht komplett
 * abgepfiffen ist. Ist die Saison durch, bleibt es der letzte.
 *
 * Die Deadline ist der erste Anpfiff des Spieltags, nicht der des eigenen
 * Spielers. Sonst koennte man sonntags noch einen Spieler einwechseln, dessen
 * Punkte man vom Freitagsspiel bereits kennt.
 */
export async function activeMatchday(): Promise<ActiveMatchday> {
  const offen = await prisma.match.findFirst({
    where: { finished: false },
    orderBy: [{ matchday: "asc" }, { kickoff: "asc" }],
    select: { matchday: true },
  });

  const letzter = await prisma.match.aggregate({ _max: { matchday: true } });
  const matchday = offen?.matchday ?? letzter._max.matchday ?? 1;

  const ersterAnpfiff = await prisma.match.aggregate({
    where: { matchday },
    _min: { kickoff: true },
  });
  const deadline = ersterAnpfiff._min.kickoff;

  return {
    matchday,
    deadline,
    locked: deadline ? Date.now() >= deadline.getTime() : false,
  };
}
