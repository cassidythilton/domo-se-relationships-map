import { useEffect, useState } from "react";
import { roleStyle } from "../config";
import { ensureProfilesLoaded, profilePictureFor } from "../data/profiles";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  name: string;
  roleType?: string;
  size?: Size;
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

// Module-level cache so we only kick off the dataset fetch once.
let PROFILES_READY = false;
let PROFILES_PROMISE: Promise<unknown> | null = null;

function startProfileLoad(onReady: () => void) {
  if (PROFILES_READY) {
    onReady();
    return;
  }
  if (!PROFILES_PROMISE) {
    PROFILES_PROMISE = ensureProfilesLoaded().then(() => {
      PROFILES_READY = true;
    });
  }
  PROFILES_PROMISE.then(onReady);
}

export function Avatar({ name, roleType, size = "md", style, onClick, title }: Props) {
  const r = roleType ? roleStyle(roleType) : null;
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    PROFILES_READY ? profilePictureFor(name) : null,
  );
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (PROFILES_READY) {
      const u = profilePictureFor(name);
      setPhotoUrl(u);
      setErrored(false);
      return;
    }
    startProfileLoad(() => {
      if (cancelled) return;
      setPhotoUrl(profilePictureFor(name));
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return (
    <span
      className={SIZE_CLASS[size]}
      style={{
        background: r?.fill ?? undefined,
        color: r?.text ?? undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onClick={onClick}
      title={title ?? name}
    >
      {photoUrl && !errored ? (
        <img
          className="avatar-img"
          src={photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
