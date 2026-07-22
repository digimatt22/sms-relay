import LoginForm from "@/app/login/login-form";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPlatformName } from "@/lib/branding";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ passwordChanged?: string; passwordReset?: string; mobileVerified?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const sp = await searchParams;
  return <LoginForm passwordChanged={sp.passwordChanged === "1"} passwordReset={sp.passwordReset === "1"} mobileVerified={sp.mobileVerified === "1"} platformName={getPlatformName()} />;
}
