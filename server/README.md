# Rivalleague – Backend

Next.js-Backend (App Router) des Rivalleague-Managers. Aufbau und Installation
stehen in der [README im Projektwurzelverzeichnis](../README.md).

```bash
npm install
npm run migrate       # Prisma, danach npm run dev neu starten
npm run dev           # :3000
npm test              # Fachlogik in lib/, ohne Datenbank
```

Die Fachlogik liegt rein in `lib/`, die Route Handlers in `app/api/` bleiben dünn.
