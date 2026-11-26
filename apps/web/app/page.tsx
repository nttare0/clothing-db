import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await cookies();
  const signedIn = store.has("clothflow_session");
  redirect(signedIn ? "/dashboard" : "/signin");
}
