import { prisma } from "./db";

// Ohne O/0/I/1 - der Code wird per Telefon durchgegeben und abgetippt.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Wuerfelt so lange, bis der Code frei ist. Bei 32^6 Kombinationen reicht das. */
export async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    if (!(await prisma.league.findUnique({ where: { inviteCode: code } }))) {
      return code;
    }
  }
  throw new Error("Kein freier Einladungscode gefunden");
}
