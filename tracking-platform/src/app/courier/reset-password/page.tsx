import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function JoyriderResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const login = typeof sp.login === "string" ? sp.login : "";
  const resetKey = typeof sp.key === "string" ? sp.key : "";
  return (
    <ResetPasswordForm
      appName="JoyRider"
      iconSrc="/icons/app-joyrider-512.png"
      portal="driver"
      login={login}
      resetKey={resetKey}
      homeHref="/courier"
    />
  );
}
