import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, buildOrgTree } from "../store/selectors";
import type { OrgNode } from "../store/selectors";
import { managerAccent } from "../config";
import type { Person } from "../data/types";

export function OrgChart() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const density = useStore((s) => s.density);
  const select = useStore((s) => s.selectPerson);

  const tree = useMemo(() => {
    if (!model) return null;
    const filtered = applyFilters(model, { ...filters, segment: null });
    const matched = new Set(filtered.map((p) => p.id));
    const t = buildOrgTree(model.people);
    return t ? { tree: t, matched } : null;
  }, [model, filters]);

  if (!model) return null;
  if (!tree) return <div className="state state-empty">No L1 root found in dataset.</div>;

  const root = tree.tree;
  const l2 = root.children;

  return (
    <div className="org-wrap">
      <div className="org-tree">
        <div className="org-l1">
          <NodeCard
            node={root}
            kind="l1"
            matched={tree.matched}
            onClick={() => select(root.person.id)}
          />
        </div>
        <div className="org-l2-row">
          {l2.map((n) => {
            const accent = managerAccent(n.person.name);
            return (
              <div key={n.person.id} className="org-l2-col">
                <div className="org-connector" />
                <NodeCard
                  node={n}
                  kind="l2"
                  accent={accent}
                  matched={tree.matched}
                  onClick={() => select(n.person.id)}
                />
                {density >= 2 && n.children.length > 0 && (
                  <div className="org-l3-stack">
                    {n.children.map((l3) => (
                      <SubColumn
                        key={l3.person.id}
                        node={l3}
                        accent={accent}
                        density={density}
                        matched={tree.matched}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NodeCard({
  node,
  kind,
  accent,
  matched,
  onClick,
}: {
  node: OrgNode;
  kind: "l1" | "l2";
  accent?: string;
  matched: Set<string>;
  onClick: () => void;
}) {
  const dim = matched.size > 0 && !matched.has(node.person.id);
  if (kind === "l1") {
    return (
      <div className={"org-node org-node-l1" + (dim ? " dim" : "")} onClick={onClick}>
        <div className="org-node-name">{node.person.name}</div>
        <div className="org-node-sub">Head of Solutions Consulting</div>
      </div>
    );
  }
  const sub =
    node.person.segment_label && node.person.segment_label !== "SC Org"
      ? node.person.segment_label
      : node.person.tier;
  return (
    <div
      className={"org-node" + (dim ? " dim" : "")}
      style={{ borderLeftColor: accent }}
      onClick={onClick}
    >
      <div className="org-node-name">{node.person.name}</div>
      <div className="org-node-sub">{sub}</div>
    </div>
  );
}

function SubColumn({
  node,
  accent,
  density,
  matched,
}: {
  node: OrgNode;
  accent: string;
  density: number;
  matched: Set<string>;
}) {
  const select = useStore((s) => s.selectPerson);
  return (
    <div>
      <Card
        person={node.person}
        accent={accent}
        matched={matched}
        onClick={() => select(node.person.id)}
      />
      {density >= 3 && node.children.length > 0 && (
        <div className="org-l4-stack">
          {node.children.map((c) => (
            <Card
              key={c.person.id}
              person={c.person}
              accent={accent}
              matched={matched}
              size="sm"
              onClick={() => select(c.person.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  person,
  accent,
  matched,
  size,
  onClick,
}: {
  person: Person;
  accent: string;
  matched: Set<string>;
  size?: "sm";
  onClick: () => void;
}) {
  const dim = matched.size > 0 && !matched.has(person.id);
  return (
    <div
      className={
        "org-sub-card" +
        (size === "sm" ? " org-sub-card-sm" : "") +
        (dim ? " dim" : "")
      }
      style={{ ["--manager-accent" as string]: accent }}
      onClick={onClick}
    >
      {person.name}
    </div>
  );
}
