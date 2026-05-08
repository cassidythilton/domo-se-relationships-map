import type { Person, AssignmentRole } from "../data/types";
import { roleColor, readableTextOn } from "../config";
import { useStore } from "../store";

type Props = {
  rep: Person;
  role?: AssignmentRole;
};

export function RepCircle({ rep, role }: Props) {
  const select = useStore((s) => s.selectPerson);
  const bg = roleColor(rep.role_type);
  const fg = readableTextOn(bg);
  const badge = role ? role.charAt(0) : null;
  return (
    <button
      className="rep-circle"
      style={{ background: bg, color: fg }}
      title={`${rep.name} \u2014 ${rep.role_type || "role n/a"}${role ? ` \u2014 ${role}` : ""}`}
      onClick={() => select(rep.id)}
    >
      {rep.name}
      {badge && (
        <span className={`rep-role-badge rep-role-${role}`} aria-label={role}>
          {badge}
        </span>
      )}
    </button>
  );
}
