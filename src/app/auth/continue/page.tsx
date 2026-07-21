import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { mustChangePassword } from "@/lib/passwords";

export default async function ContinueAfterLoginPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (await mustChangePassword(session.user.id)) redirect("/change-password");
  redirect("/messages");
}
