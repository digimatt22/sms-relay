import LoginForm from "@/app/login/login-form";
import { getPlatformName } from "@/lib/branding";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ passwordChanged?: string; passwordReset?: string; mobileVerified?: string }>;
}) {
  const sp = await searchParams;
  return <LoginForm passwordChanged={sp.passwordChanged === "1"} passwordReset={sp.passwordReset === "1"} mobileVerified={sp.mobileVerified === "1"} platformName={getPlatformName()} />;
}
