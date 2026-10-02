import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function WrapriderResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const login = typeof sp.login === "string" ? sp.login : "";
  const resetKey = typeof sp.key === "string" ? sp.key : "";
  return (
    <ResetPasswordForm
      appName="WrapRider"
      iconSrc="/icons/app-wraprider-512.png"
      portal="wraprider"
      login={login}
      resetKey={resetKey}
      homeHref="/wraprider"
    />
  );
}
