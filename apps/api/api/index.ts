import { handle } from "hono/vercel";
import { createApp } from "../src/app";

// Bare /api root: same app (returns 404 envelope via notFound handler, or health at /api/health).
export default handle(createApp());
