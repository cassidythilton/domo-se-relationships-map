import type { Person, AssignmentRole } from "../data/types";
import { roleAccent, softTint } from "../config";
import { useStore } from "../store";

type Props = {
  rep: Person;
  role?: AssignmentRole;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RepCircle({ rep, role }: Props) {
  const select = useStore((s) => s.selectPerson);
  const accent = roleAccent(rep.role_type);
  const bg = softTint(accent, 0.95, 0.025);
  const badge = role ? role.charAt(0) : null;
  const tooltip = `${rep.name} — ${rep.role_type || "role n/a"}${role ? ` — ${role}` : ""}`;
  return (
    <button
      className="rep-token"
      style={{ background: bg, color: accent }}
      title={tooltip}
      onClick={() => select(rep.id)}
      type="button"
    >
      {initials(rep.name)}
      {badge && (
        <span className={`rep-role-badge rep-role-${role}`} aria-label={role}>
          {badge}
        </span>
      )}
    </button>
  );
}
