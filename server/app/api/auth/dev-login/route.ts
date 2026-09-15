import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { devOnly, HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";

/**
 * Entwicklungs-Login ohne OAuth. Notwendig, weil Google keine
 * http://192.168.x.x-Redirect-URIs erlaubt und das Backend waehrend der
 * Entwicklung nur im WLAN erreichbar ist.
 *
 * SICHERHEIT: Ohne diesen Guard koennte in Produktion jeder jeden Account
 * uebernehmen, indem er einfach den passenden Namen schickt.
 */
export const POST = handle(async (req: Request) => {
  devOnly();
  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) throw new HttpError(400, "name fehlt");

  const user = await prisma.user.upsert({
    where: { email: `${name.trim().toLowerCase()}@dev.local` },
    update: {},
    create: { name: name.trim(), email: `${name.trim().toLowerCase()}@dev.local` },
  });
  return { token: await signToken(user.id), user };
});
