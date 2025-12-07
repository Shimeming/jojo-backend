import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

loadEnv();

// Seed script for GROUP table
// Schema: public."GROUP"(Group_id serial PK, Name text UNIQUE)
// Generates realistic NTU groups: departments, dorms, and clubs

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');

// Load all departments from department_people.csv
function parseDepartmentsCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  const idx = (name) => header.indexOf(name);
  const mapLine = (line) => {
    const cols = line.split(',');
    return {
      DeptName: cols[idx('院系')],
      DeptCode: cols[idx('組別代碼')],
    };
  };
  const data = lines.map(mapLine);
  const excludeCodes = new Set([
    '0000', '1000', '2000', '3000', '4000', '5000',
    '6000', '7000', '8000', '9000', 'A000', 'B000'
  ]);
  const names = new Set();
  for (const d of data) {
    // skip aggregate college rows
    if (excludeCodes.has(d.DeptCode)) continue;
    if (!d.DeptName) continue;
    names.add(d.DeptName);
  }
  return Array.from(names);
}

const CSV_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  './department_people.csv'
);
const DEPARTMENTS = parseDepartmentsCSV(CSV_PATH);

// Dorms and residence halls (expanded programmatically)
function range(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
const DORMS = [
  ...range(8).map((i) =>
    `男${['一', '二', '三', '四', '五', '六', '七', '八'][i - 1]}舍`
  ),
  '大一女舍',
  ...range(8).map((i) =>
    `女${['一', '二', '三', '四', '五', '六', '八', '九'][i - 1]}舍`
  ),
  ...range(2).map((i) => `研${['一', '三'][i - 1]}舍`),
  '長興BOT A 棟', '長興BOT B 棟', '水源BOT A 棟',
  '水源BOT B 棟', '水源BOT C 棟'
];

const CLUBS = [
  // 藝術
  '台大美術社', '台大書法社', '篆刻藝術社', '台大話劇社', '台大崑曲社', '台大國劇社', '台大歌仔戲社', '台大國畫社', '台大視聽社',
  // 商業
  '數位產業研究社', '國際經濟商管學生會台大分會', '亞太青年創業社', '台灣大學期貨研究社', '台灣大學證券研究社', '台大認購權證研究社',
  // 文化
  '台大小說賞析社', '台大推理小說研究社', '台大卡漫社', '台大嘻研社',
  '台大歐洲文化研究社', '北大專院校電影聯盟', '台大電影社',
  '德國文化研究社', '台大客家社', '台大戲學會', '台大火車社',
  '台大台文社', '台北生活社', '台大布袋戲研習社', '集郵社',
  '法國文化研究社', '日本文化研究社', '古蹟文化研習社',
  '台大藝文期刊社', '台大台語文社', '台大奇幻社', '台大廣告社',
  '台大大眾傳播學會', '台大學生報', '望月詩社', '台大現代詩社',
  '野鴨詩社', '台大哲思坊',
  // 心靈
  '玄宇功研習社', '台大崇德青年', '台大禪學社', '台大心靈研究社',
  '台大晨曦佛學社', '法鼓山法青會', '台大法輪大法社', '台大研究生小組',
  '台大真愛社', '台大真信社', '新心服務社', '學園團契社', '光鹽社',
  '聖經研究社', '倍加團契', '台大聯禱會', 'We Teach台大創意服務社',
  // 音樂
  '日文歌曲社', '青韻合唱團', '星韻合唱團', '新世紀合唱團',
  '台大合唱團', '台大杏林合唱團', '台北愛樂青年團',
  '日本搖滾藝術文化研究社', '台大古琴社', '台大交響樂團',
  '台大爵士愛樂社', '台大音樂劇研究社', '台大普普音樂社',
  '台大愛樂社', '台大詞曲創作社', '杏林絃樂團', '台大口琴社',
  '椰風搖滾社', '台大古典吉他社', '台大薰風國樂團',
  '台大saxophone社',
  // 逸趣
  '台大水族寵物社', '西洋占星社', '台大禾易論命社', '台大塔羅社',
  '台大調酒社', '台大咖啡社', '台大追夢社', '台大塑身社',
  '台大茶藝社', '世界民族舞蹈社', '台大現代舞社',
  '台大醫學院楓韻舞社', '台大踢踏舞社', '台大土風舞社',
  '探戈社', '台大魔術社',
  // 權利
  '台大女研', '國立台灣大學男同性戀社',
  // 康服 / 關懷
  '台大浪達社', '台大自然保育社', '臺大環保社', '關懷生命社',
  '台大椰林急救社', '台大達義社', '人本種籽服務社',
  '台大世界志工社', '台大青輔社', '台大種子教育社',
  '臺大服務風氣推進社', '台大慈濟青年社', '台大羅浮群',
];

async function insertGroups(groups) {
  const cs = new pgp.helpers.ColumnSet(
    ['name', 'category'],
    { table: { table: 'group', schema: 'jojo' } }
  );
  const query = pgp.helpers.insert(groups, cs);
  return db.none(query);
}

async function main() {
  const departmentGroups = DEPARTMENTS.map((d) => ({ name: `臺大${d}`, category: 'department' }));
  const dormGroups = DORMS.map((name) => ({ name, category: 'dorm' }));
  const clubGroups = CLUBS.map((name) => ({ name, category: 'club' }));
  const groups = [...departmentGroups, ...dormGroups, ...clubGroups];
  if (DRY_RUN) {
    console.log(`[dry] Generated ${groups.length} GROUP rows:`);
    console.table(groups);
    return;
  } else {
    try {
      await insertGroups(groups);
      console.log(`Inserted ${groups.length} GROUP rows into jojo.group`);
    } catch (err) {
      console.error('Failed to insert groups:', err);
      process.exitCode = 1;
    } finally {
      pgp.end();
    }
  }
}

main();
