import { roleAccent, softTint } from "../config";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  name: string;
  roleType?: string;
  size?: Size;
  /** Inline style override (e.g. cursor on the parent). */
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "avatar avatar-sm",
  md: "avatar",
  lg: "avatar avatar-lg",
  xl: "avatar avatar-xl",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, roleType, size = "md", style, onClick, title }: Props) {
  const bg = roleType ? softTint(roleAccent(roleType), 0.95, 0.02) : undefined;
  const fg = roleType ? roleAccent(roleType) : undefined;
  return (
    <span
      className={SIZE_CLASS[size]}
      style={{
        background: bg,
        color: fg,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onClick={onClick}
      title={title ?? name}
    >
      {initials(name)}
    </span>
  );
}
