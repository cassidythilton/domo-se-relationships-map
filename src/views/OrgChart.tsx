import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, buildOrgTree } from "../store/selectors";
import type { OrgNode } from "../store/selectors";
import { managerColor, PALETTES, tint } from "../config";
import type { Person } from "../data/types";

export function OrgChart() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const density = useStore((s) => s.density);
  const select = useStore((s) => s.selectPerson);

  // Org chart is always rooted in SC Org, but it respects search/role filters
  // by dimming non-matching nodes.
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
    <div className="sc-org">
      <div className="sc-l1">
        <Node node={root} kind="l1" matched={tree.matched} onClick={() => select(root.person.id)} />
      </div>
      <div className="sc-l2-row">
        {l2.map((n) => {
          const palette = managerColor(n.person.name);
          return (
            <div key={n.person.id} className="sc-l2-col">
              <div className="sc-connector" />
              <Node
                node={n}
                kind="l2"
                palette={palette}
                matched={tree.matched}
                onClick={() => select(n.person.id)}
              />
              {density >= 2 && n.children.length > 0 && (
                <div className="sc-l3-stack">
                  {n.children.map((l3) => (
                    <SubColumn
                      key={l3.person.id}
                      node={l3}
                      l2Bg={palette.bg}
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
  );
}

type Pal = { bg: string; fg: string };

function Node({
  node,
  kind,
  palette,
  matched,
  onClick,
}: {
  node: OrgNode;
  kind: "l1" | "l2";
  palette?: Pal;
  matched: Set<string>;
  onClick: () => void;
}) {
  if (kind === "l1") {
    return (
      <div
        className="sc-node sc-node-l1"
        style={{ background: PALETTES.l1.bg, color: PALETTES.l1.fg }}
        onClick={onClick}
      >
        <div className="sc-node-name">{node.person.name}</div>
      </div>
    );
  }
  const sub =
    node.person.segment_label && node.person.segment_label !== "SC Org"
      ? node.person.segment_label
      : "";
  const pal = palette ?? { bg: "#888", fg: "#fff" };
  const dim = matched.size > 0 && !matched.has(node.person.id);
  return (
    <div
      className="sc-node sc-node-l2"
      style={{ background: pal.bg, color: pal.fg, opacity: dim ? 0.4 : 1 }}
      onClick={onClick}
    >
      <div className="sc-node-name">{node.person.name}</div>
      {sub && <div className="sc-node-sub">{sub}</div>}
    </div>
  );
}

function SubColumn({
  node,
  l2Bg,
  density,
  matched,
}: {
  node: OrgNode;
  l2Bg: string;
  density: number;
  matched: Set<string>;
}) {
  const select = useStore((s) => s.selectPerson);
  return (
    <div className="sc-sub-col">
      <Card
        person={node.person}
        tint={tint(l2Bg, 0.7)}
        matched={matched}
        onClick={() => select(node.person.id)}
      />
      {density >= 3 && node.children.length > 0 && (
        <div className="sc-l4-stack">
          {node.children.map((c) => (
            <Card
              key={c.person.id}
              person={c.person}
              tint={tint(l2Bg, 0.85)}
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
  tint: bg,
  matched,
  size,
  onClick,
}: {
  person: Person;
  tint: string;
  matched: Set<string>;
  size?: "sm";
  onClick: () => void;
}) {
  const dim = matched.size > 0 && !matched.has(person.id);
  return (
    <div
      className={"sc-sub-card" + (size === "sm" ? " sc-sub-card-sm" : "")}
      style={{ background: bg, opacity: dim ? 0.4 : 1 }}
      onClick={onClick}
    >
      {person.name}
    </div>
  );
}
