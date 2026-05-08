// Sample data used only in dev mode (npm run dev) when no Domo dataset is reachable.
// Mirrors the shape and naming style of the production salesOrgPeople dataset, with
// additional Phase C columns populated so every view has something to render.

type Row = Record<string, string | number>;

const row = (
  name: string,
  segment: string,
  tier: string,
  manager_name: string,
  role_type: string,
  team_column: string,
  ae_row: string,
  sort_order: number,
  extra: Partial<Row> = {},
): Row => ({
  name,
  segment,
  tier,
  manager_name,
  role_type,
  team_column,
  ae_row,
  segment_label: segment,
  sort_order,
  is_active: "TRUE",
  notes: "",
  primary_pod: "",
  backup_pod: "",
  overlay_pods: "",
  primary_alloc_pct: 0,
  backup_alloc_pct: 0,
  overlay_alloc_pct: 0,
  specializations: "",
  target_load_pct: 100,
  hire_date: "",
  ramp_status: "active",
  email: "",
  photo_url: "",
  ...extra,
});

export const SAMPLE_PEOPLE: Row[] = [
  row("Mike H", "SC Org", "L1", "", "", "", "", 0),

  row("Dan", "SC Org", "L2", "Mike H", "", "", "", 10, {
    segment_label: "Corp NL",
  }),
  row("Tyler", "SC Org", "L2", "Mike H", "", "", "", 11, {
    segment_label: "Corp Upsell",
  }),
  row("Chris", "SC Org", "L2", "Mike H", "", "", "", 12, {
    segment_label: "Enterprise",
  }),
  row("LQ", "SC Org", "L2", "Mike H", "", "", "", 13, {
    segment_label: "Ecosystem",
  }),
  row("Blake", "SC Org", "L2", "Mike H", "", "", "", 14, {
    segment_label: "ISV",
  }),

  row("Doug", "SC Org", "L3", "Dan", "", "", "", 20),
  row("Cameron", "SC Org", "L3", "Dan", "", "", "", 21),
  row("Dave B", "SC Org", "L3", "Tyler", "", "", "", 22),
  row("Brock", "SC Org", "L3", "Tyler", "", "", "", 23),
  row("Sione", "SC Org", "L3", "Chris", "", "", "", 24),
  row("Eric", "SC Org", "L3", "Chris", "", "", "", 25),
  row("Ty Yagi Ecosystem", "SC Org", "L3", "LQ", "", "", "", 26),
  row("Nate Ecosystem", "SC Org", "L3", "LQ", "", "", "", 27),

  // Corp NL swimlane reps (L4 leaves)
  ...corpNLReps(),
  ...corpUpsellReps(),
  ...entReps(),
];

function rep(
  name: string,
  segment: string,
  manager: string,
  role_type: string,
  team_column: string,
  ae_row: string,
  sort: number,
  primary_pod: string,
  primary_alloc_pct: number,
  extra: Partial<Row> = {},
): Row {
  return row(name, segment, "L4", manager, role_type, team_column, ae_row, sort, {
    primary_pod,
    primary_alloc_pct,
    ...extra,
  });
}

function corpNLReps(): Row[] {
  return [
    rep("Alex Carter", "Corp NL", "Doug", "Corporate NL", "Doug", "Pod A", 100, "Doug", 80, {
      backup_pod: "Cameron",
      backup_alloc_pct: 20,
      specializations: "Domo Everywhere, AI",
      ramp_status: "active",
      tenure_months: 36,
      hire_date: "2022-04-01",
    }),
    rep("Jamie Lee", "Corp NL", "Doug", "Corporate NL", "Doug", "Pod B", 101, "Doug", 100, {
      specializations: "AI",
      tenure_months: 18,
    }),
    rep("Priya Shah", "Corp NL", "Cameron", "New Logo", "Cameron", "Pod A", 102, "Cameron", 60, {
      backup_pod: "Doug",
      backup_alloc_pct: 30,
      overlay_pods: "Brock",
      overlay_alloc_pct: 20,
      specializations: "Healthcare, Snowflake",
      tenure_months: 28,
    }),
    rep("Diego Ruiz", "Corp NL", "Cameron", "Corporate NL", "Cameron", "Pod B", 103, "Cameron", 90, {
      specializations: "FSI",
      ramp_status: "ramping",
      tenure_months: 4,
    }),
    rep("Sofia Park", "Corp NL", "Cameron", "Extra AE", "Cameron", "Pod C", 104, "Cameron", 50, {
      overlay_pods: "Doug, Brock",
      overlay_alloc_pct: 30,
      specializations: "AI, ISV",
    }),
    rep("Ravi Iyer", "Corp NL", "Doug", "Domo Everywhere", "Doug", "Pod C", 105, "Doug", 70, {
      overlay_pods: "Cameron",
      overlay_alloc_pct: 40,
      specializations: "Domo Everywhere, ISV",
    }),
  ];
}

function corpUpsellReps(): Row[] {
  return [
    rep("Hannah West", "Corp Upsell", "Dave B", "Upsell", "Dave B", "Row 1", 200, "Dave B", 100, {
      specializations: "Retail, Snowflake",
      tenure_months: 50,
    }),
    rep("Marcus Field", "Corp Upsell", "Dave B", "Upsell", "Dave B", "Row 2", 201, "Dave B", 60, {
      backup_pod: "Brock",
      backup_alloc_pct: 30,
      specializations: "AI",
    }),
    rep("Tina Olafur", "Corp Upsell", "Brock", "Upsell", "Brock", "Row 1", 202, "Brock", 80, {
      specializations: "FSI",
      ramp_status: "ramping",
      tenure_months: 6,
    }),
    rep("Owen Chase", "Corp Upsell", "Brock", "Domo Everywhere", "Brock", "Row 2", 203, "Brock", 50, {
      overlay_pods: "Dave B",
      overlay_alloc_pct: 50,
      specializations: "Domo Everywhere, AI",
    }),
  ];
}

function entReps(): Row[] {
  return [
    rep("Karen Voss", "ENT", "Sione", "Enterprise", "Sione", "West", 300, "Sione", 100, {
      specializations: "FSI, Snowflake, AWS",
      tenure_months: 60,
    }),
    rep("James Kerr", "ENT", "Sione", "Enterprise", "Sione", "Central", 301, "Sione", 70, {
      backup_pod: "Eric",
      backup_alloc_pct: 30,
      specializations: "Healthcare",
    }),
    rep("Lin Tao", "ENT", "Eric", "Enterprise", "Eric", "East", 302, "Eric", 100, {
      specializations: "Retail, AI",
    }),
    rep("Noah Black", "ENT", "Eric", "ISV", "Eric", "East", 303, "Eric", 60, {
      overlay_pods: "Sione",
      overlay_alloc_pct: 40,
      specializations: "ISV, Snowflake",
    }),
    rep("Ana Reyes", "ENT", "Ty Yagi Ecosystem", "Ecosystem", "Ty Yagi Ecosystem", "West", 304, "Ty Yagi Ecosystem", 100, {
      specializations: "Ecosystem, AWS",
    }),
    rep("Felix Hu", "ENT", "Nate Ecosystem", "Ecosystem", "Nate Ecosystem", "Central", 305, "Nate Ecosystem", 80, {
      overlay_pods: "Sione",
      overlay_alloc_pct: 30,
      specializations: "Ecosystem, Databricks",
    }),
  ];
}
