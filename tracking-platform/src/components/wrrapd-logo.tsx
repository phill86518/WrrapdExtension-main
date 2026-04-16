const WRRAPD_LOGO_URL = "https://pay.wrrapd.com/img/wrrapd-logo-1-small.png";

type Props = {
  className?: string;
  /** Accessible label; omit when logo is decorative next to visible title. */
  title?: string;
};

export function WrrapdLogo({ className, title = "Wrrapd" }: Props) {
  return (
    <img
      src={WRRAPD_LOGO_URL}
      alt={title}
      className={className ?? "h-9 w-auto max-w-[160px] object-contain object-left"}
    />
  );
}
