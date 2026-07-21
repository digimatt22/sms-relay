import ChangePasswordForm from "@/app/change-password/change-password-form";
import { getPlatformName } from "@/lib/branding";

export default function ChangePasswordPage() {
  return <ChangePasswordForm platformName={getPlatformName()} />;
}
