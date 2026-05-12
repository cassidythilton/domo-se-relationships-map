// Sample data used only in dev mode (npm run dev) when no Domo dataset is
// reachable. We inline the v2 roster CSV so dev mode renders the actual
// org structure (Cassidy / Dan / Tyler / Chris / Laura, plus all RVPs and
// AEs from the screenshots).

type Row = Record<string, string | number>;

// CSV columns must match RawPerson 1:1 (see src/data/types.ts).
const CSV = `name,segment,tier,manager_name,role_type,team_column,ae_row,segment_label,sort_order,is_active,notes
Cassidy Hilton,SC Org,L1,,,,,SC Org,1,TRUE,
Dan Wentworth,SC Org,L2,Cassidy Hilton,,,,Corp NL,2,TRUE,
Tyler Clark,SC Org,L2,Cassidy Hilton,,,,Corp Upsell,3,TRUE,
Chris Hunter,SC Org,L2,Cassidy Hilton,,,,Ent/SR Corp,4,TRUE,
Laura Qualey,SC Org,L2,Cassidy Hilton,,,,SC Org,5,TRUE,
Blake Woodward,SC Org,L2,Cassidy Hilton,,,,SC Org,6,TRUE,
Kenny Scott,SC Org,L3,Dan Wentworth,,,,SC Org,7,TRUE,
Mason Crane,SC Org,L3,Dan Wentworth,,,,SC Org,8,TRUE,
Brendan Carr,SC Org,L3,Dan Wentworth,,,,SC Org,9,TRUE,
Isaac Thacker,SC Org,L3,Dan Wentworth,,,,SC Org,10,TRUE,
Miles Herleikson,SC Org,L3,Dan Wentworth,,,,SC Org,11,TRUE,
Ryan Brinkerhoff,SC Org,L3,Dan Wentworth,,,,SC Org,12,TRUE,
Rob Jusino,SC Org,L3,Tyler Clark,,,,SC Org,13,TRUE,
Shana Brennan,SC Org,L3,Tyler Clark,,,,SC Org,14,TRUE,
Matt Torline,SC Org,L3,Tyler Clark,,,,SC Org,15,TRUE,
Mike Tong,SC Org,L3,Tyler Clark,,,,SC Org,16,TRUE,
Scott Pulley,SC Org,L3,Tyler Clark,,,,SC Org,17,TRUE,
Heather Dilts,SC Org,L3,Tyler Clark,,,,SC Org,18,TRUE,
Jeff Clobes,SC Org,L3,Tyler Clark,,,,SC Org,19,TRUE,
James Miller,SC Org,L3,Tyler Clark,,,,SC Org,20,TRUE,
Dan Gouveia,SC Org,L3,Chris Hunter,,,,SC Org,21,TRUE,
Ron Karas,SC Org,L3,Chris Hunter,,,,SC Org,22,TRUE,
Matt Newsom,SC Org,L3,Chris Hunter,,,,SC Org,23,TRUE,
Braxton Fullenkamp,SC Org,L3,Chris Hunter,,,,SC Org,24,TRUE,
Megha Kumar,SC Org,L3,Chris Hunter,,,,SC Org,25,TRUE,
Abby Stowell,SC Org,L3,Chris Hunter,,,,SC Org,26,TRUE,
Doug Carter,SC Org,L3,Laura Qualey,,,,SC Org,27,TRUE,
Gordon Pont,SC Org,L3,Laura Qualey,,,,SC Org,28,TRUE,
Elliott Leonard,SC Org,L3,Laura Qualey,,,,SC Org,29,TRUE,
Paul McCusker,SC Org,L3,Laura Qualey,,,,SC Org,30,TRUE,
Doug Hut,Corp NL,L3,Dan Wentworth,,Doug,,Corp NL,1,TRUE,
Cameron Housley,Corp NL,L3,Dan Wentworth,,Cameron,,Corp NL,2,TRUE,
Dave Bauerle,Corp NL,L3,Dan Wentworth,,Dave B,,Corp NL,3,TRUE,
Ty Yagi,Corp NL,L3,Dan Wentworth,,Ty Yagi Ecosystem,,Corp NL,4,TRUE,
Nate Enderle,Corp NL,L3,Dan Wentworth,,Nate Ecosystem,,Corp NL,5,TRUE,
Mike Harding,Corp NL,L3,Dan Wentworth,,Mike H,,Corp NL,6,TRUE,
Megha Kumar,Corp NL,L4,,,,Megha,Corp NL,7,TRUE,ae_row anchor
Abby Stowell,Corp NL,L4,,,,Abby,Corp NL,8,TRUE,ae_row anchor
Kenny Scott,Corp NL,L4,,,,Kenny,Corp NL,9,TRUE,ae_row anchor
Mason Crane,Corp NL,L4,,,,Mason,Corp NL,10,TRUE,ae_row anchor
Brendan Carr,Corp NL,L4,,,,Brendan,Corp NL,11,TRUE,ae_row anchor
Isaac Thacker,Corp NL,L4,,,,Isaac,Corp NL,12,TRUE,ae_row anchor
Miles Herleikson,Corp NL,L4,,,,Miles,Corp NL,13,TRUE,ae_row anchor
Ryan Brinkerhoff,Corp NL,L4,,,,Ryan B,Corp NL,14,TRUE,ae_row anchor
Greg Olson,Corp NL,L4,,Ecosystem,Doug,Megha,Corp NL,15,TRUE,
Grant A,Corp NL,L4,,Corporate NL,Doug,Megha,Corp NL,16,TRUE,
Chris S,Corp NL,L4,,Extra AE,Doug,Abby,Corp NL,17,TRUE,
Tanner H,Corp NL,L4,,Corporate NL,Doug,Abby,Corp NL,18,TRUE,
Kyle B,Corp NL,L4,,Corporate NL,Doug,Kenny,Corp NL,19,TRUE,
Michael C,Corp NL,L4,,Ecosystem,Doug,Mason,Corp NL,20,TRUE,
Bradey S,Corp NL,L4,,Corporate NL,Cameron,Megha,Corp NL,21,TRUE,
Adam D,Corp NL,L4,,Corporate NL,Cameron,Megha,Corp NL,22,TRUE,
Ryan V,Corp NL,L4,,Corporate NL,Cameron,Megha,Corp NL,23,TRUE,
Lance K,Corp NL,L4,,Corporate NL,Cameron,Abby,Corp NL,24,TRUE,
Scott C,Corp NL,L4,,Ecosystem,Cameron,Abby,Corp NL,25,TRUE,
Sam H,Corp NL,L4,,Corporate NL,Cameron,Abby,Corp NL,26,TRUE,
Kaden B,Corp NL,L4,,Corporate NL,Dave B,Kenny,Corp NL,27,TRUE,
Greg G,Corp NL,L4,,Extra AE,Dave B,Kenny,Corp NL,28,TRUE,
Diggy I,Corp NL,L4,,Corporate NL,Dave B,Kenny,Corp NL,29,TRUE,
Nate B,Corp NL,L4,,Corporate NL,Dave B,Mason,Corp NL,30,TRUE,
Marci J,Corp NL,L4,,Ecosystem,Dave B,Mason,Corp NL,31,TRUE,
Burke M,Corp NL,L4,,Extra AE,Dave B,Mason,Corp NL,32,TRUE,
Michael S,Corp NL,L4,,Corporate NL,Dave B,Mason,Corp NL,33,TRUE,
Joe T,Corp NL,L4,,Ecosystem,Ty Yagi Ecosystem,Miles,Corp NL,34,TRUE,
Jake M,Corp NL,L4,,Ecosystem,Ty Yagi Ecosystem,Ryan B,Corp NL,35,TRUE,
Stephen S,Corp NL,L4,,Ecosystem,Ty Yagi Ecosystem,Ryan B,Corp NL,36,TRUE,
Davey B,Corp NL,L4,,Ecosystem,Nate Ecosystem,Miles,Corp NL,37,TRUE,
Austin D,Corp NL,L4,,Ecosystem,Nate Ecosystem,Miles,Corp NL,38,TRUE,
Nick N,Corp NL,L4,,Ecosystem,Nate Ecosystem,Ryan B,Corp NL,39,TRUE,
Cade C,Corp NL,L4,,ISV,Mike H,Brendan,Corp NL,40,TRUE,
Kimball N,Corp NL,L4,,ISV,Mike H,Brendan,Corp NL,41,TRUE,
Jameson T,Corp NL,L4,,ISV,Mike H,Brendan,Corp NL,42,TRUE,
Connor L,Corp NL,L4,,Ecosystem,Mike H,Brendan,Corp NL,43,TRUE,
Dan K,Corp NL,L4,,Domo Everywhere,Mike H,Isaac,Corp NL,44,TRUE,
Josh H,Corp NL,L4,,Domo Everywhere,Mike H,Isaac,Corp NL,45,TRUE,
Jared M,Corp NL,L4,,Domo Everywhere,Mike H,Isaac,Corp NL,46,TRUE,
Juan Z,Corp NL,L4,,Corporate NL,,,Corp NL,47,TRUE,Bottom-right floater
Doug F,Corp NL,L4,,Corporate NL,,,Corp NL,48,TRUE,Bottom-right floater
Anthony K,Corp NL,L4,,Corporate NL,,,Corp NL,49,TRUE,Bottom-right floater
Brock,Corp Upsell,L3,Tyler Clark,,Brock,,Corp Upsell,1,TRUE,
Sione,Corp Upsell,L3,Tyler Clark,,Sione,,Corp Upsell,2,TRUE,
Eric,Corp Upsell,L3,Tyler Clark,,Eric,,Corp Upsell,3,TRUE,
Jordan,Corp Upsell,L3,Tyler Clark,,Jordan,,Corp Upsell,4,TRUE,
Mike,Corp Upsell,L4,,,,Mike,Corp Upsell,5,TRUE,ae_row anchor
Shana,Corp Upsell,L4,,,,Shana,Corp Upsell,6,TRUE,ae_row anchor
Scott,Corp Upsell,L4,,,,Scott,Corp Upsell,7,TRUE,ae_row anchor
Jeff,Corp Upsell,L4,,,,Jeff,Corp Upsell,8,TRUE,ae_row anchor
Rob,Corp Upsell,L4,,,,Rob,Corp Upsell,9,TRUE,ae_row anchor
Heather,Corp Upsell,L4,,,,Heather,Corp Upsell,10,TRUE,ae_row anchor
Matt T,Corp Upsell,L4,,,,Matt T,Corp Upsell,11,TRUE,ae_row anchor
James,Corp Upsell,L4,,,,James,Corp Upsell,12,TRUE,ae_row anchor
Colby J,Corp Upsell,L4,,Upsell,Brock,Shana,Corp Upsell,13,TRUE,
Patrick R,Corp Upsell,L4,,Extra AE,Brock,Shana,Corp Upsell,14,TRUE,
Eric S,Corp Upsell,L4,,Upsell,Brock,Scott,Corp Upsell,15,TRUE,
Jake W,Corp Upsell,L4,,Upsell,Brock,Scott,Corp Upsell,16,TRUE,
Simeon N,Corp Upsell,L4,,Upsell,Brock,Rob,Corp Upsell,17,TRUE,
Sergio E,Corp Upsell,L4,,Upsell,Brock,Heather,Corp Upsell,18,TRUE,
Neil M,Corp Upsell,L4,,Upsell,Brock,Matt T,Corp Upsell,19,TRUE,
Scott B,Corp Upsell,L4,,Upsell,Sione,Shana,Corp Upsell,20,TRUE,
John H,Corp Upsell,L4,,Upsell,Sione,Jeff,Corp Upsell,21,TRUE,
AJ Cox,Corp Upsell,L4,,Upsell,Sione,Jeff,Corp Upsell,22,TRUE,
Bret J,Corp Upsell,L4,,Upsell,Sione,Rob,Corp Upsell,23,TRUE,
Jessica P,Corp Upsell,L4,,Upsell,Sione,Rob,Corp Upsell,24,TRUE,
Jeff M,Corp Upsell,L4,,Upsell,Sione,Heather,Corp Upsell,25,TRUE,
Chelsea M,Corp Upsell,L4,,Upsell,Sione,Matt T,Corp Upsell,26,TRUE,
Eric L,Corp Upsell,L4,,Upsell,Eric,Mike,Corp Upsell,27,TRUE,
Fui K,Corp Upsell,L4,,Upsell,Eric,Shana,Corp Upsell,28,TRUE,
Tyler W,Corp Upsell,L4,,Extra AE,Eric,Scott,Corp Upsell,29,TRUE,
Jeremy S,Corp Upsell,L4,,Upsell,Eric,Heather,Corp Upsell,30,TRUE,
Oliver L,Corp Upsell,L4,,Upsell,Jordan,Mike,Corp Upsell,31,TRUE,
Justin L,Corp Upsell,L4,,Upsell,Jordan,Mike,Corp Upsell,32,TRUE,
Signe P,Corp Upsell,L4,,Upsell,Jordan,Scott,Corp Upsell,33,TRUE,
Kevin S,Corp Upsell,L4,,Upsell,Jordan,Jeff,Corp Upsell,34,TRUE,
Jeff H,Corp Upsell,L4,,Upsell,Jordan,Matt T,Corp Upsell,35,TRUE,
Simon N,Corp Upsell,L4,,Upsell,Jordan,James,Corp Upsell,36,TRUE,
Pasi H,Corp Upsell,L4,,Upsell,Sione,,Corp Upsell,37,TRUE,Bottom of Sione column
Gordon,Corp Upsell,L4,,Upsell,,,Corp Upsell,38,TRUE,Bottom-left no column
Taylor,ENT,L3,Chris Hunter,,Taylor,,Enterprise,1,TRUE,
Casey,ENT,L3,Chris Hunter,,Casey,,Enterprise,2,TRUE,
Dan G,ENT,L4,,,,Dan G,Enterprise,3,TRUE,ae_row anchor
Braxton,ENT,L4,,,,Braxton,Enterprise,4,TRUE,ae_row anchor
Ron,ENT,L4,,,,Ron,Enterprise,5,TRUE,ae_row anchor
Matt,ENT,L4,,,,Matt,Enterprise,6,TRUE,ae_row anchor
Jace,ENT,L4,,New Logo,Taylor,Dan G,Enterprise,7,TRUE,
Tim K,ENT,L4,,Upsell,Taylor,Dan G,Enterprise,8,TRUE,
Mike G,ENT,L4,,Upsell,Taylor,Dan G,Enterprise,9,TRUE,
Jeff D,ENT,L4,,New Logo,Taylor,Braxton,Enterprise,10,TRUE,
Kevin W,ENT,L4,,Upsell,Taylor,Braxton,Enterprise,11,TRUE,
Steve B,ENT,L4,,Upsell,Taylor,Ron,Enterprise,12,TRUE,
Jarrick T,ENT,L4,,Upsell,Taylor,Ron,Enterprise,13,TRUE,
Mike N,ENT,L4,,Upsell,Casey,Dan G,Enterprise,15,TRUE,
Xavier,ENT,L4,,New Logo,Casey,Braxton,Enterprise,16,TRUE,
Marc W,ENT,L4,,Upsell,Casey,Braxton,Enterprise,17,TRUE,
Natalie L,ENT,L4,,New Logo,Casey,Ron,Enterprise,18,TRUE,
Joe P,ENT,L4,,Upsell,Casey,Ron,Enterprise,19,TRUE,
Mitch D,ENT,L4,,New Logo,Casey,Matt,Enterprise,20,TRUE,
Truman,ENT,L4,,Upsell,Casey,Matt,Enterprise,21,TRUE,
Jordan M,ENT,L4,,Upsell,Casey,Matt,Enterprise,22,TRUE,
John B,ENT,L4,,Upsell,Casey,Matt,Enterprise,23,TRUE,
`;

function parseCsv(s: string): Row[] {
  const lines = s.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const val = cols[j] ?? "";
      if (key === "sort_order") {
        row[key] = Number(val) || 0;
      } else {
        row[key] = val;
      }
    }
    out.push(row);
  }
  return out;
}

export const SAMPLE_PEOPLE: Row[] = parseCsv(CSV);
