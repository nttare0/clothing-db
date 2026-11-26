import { createApp } from "@/lib/server/app";

// ClothFlow API served as a same-origin Next.js route handler.
// Browser calls /api/* on this origin; the web app and API share a cookie
// and deployment, so there is no cross-project proxy or CORS surface.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const app = createApp();
const serve = (req: Request) => app.fetch(req);

export const GET = serve;
export const POST = serve;
export const PATCH = serve;
export const PUT = serve;
export const DELETE = serve;
export const OPTIONS = serve;
