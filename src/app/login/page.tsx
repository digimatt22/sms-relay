import LoginForm from "@/app/login/login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ passwordChanged?: string }>;
}) {
  const sp = await searchParams;
  return <LoginForm passwordChanged={sp.passwordChanged === "1"} />;
}
