import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

loadEnv();

function parseDepartmentsCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  const idx = (name) => header.indexOf(name);
  const num = (v) => Number(v);
  const mapLine = (line) => {
    const cols = line.split(',');
    return {
      DeptName: cols[idx('院系')],
      DeptCode: cols[idx('組別代碼')],
      Total: num(cols[idx('總計_人數')]),
      Male: num(cols[idx('總計_男')]),
      Female: num(cols[idx('總計_女')]),
      Y1M: num(cols[idx('一年級_男')]),
      Y1F: num(cols[idx('一年級_女')]),
      Y2M: num(cols[idx('二年級_男')]),
      Y2F: num(cols[idx('二年級_女')]),
      Y3M: num(cols[idx('三年級_男')]),
      Y3F: num(cols[idx('三年級_女')]),
      Y4M: num(cols[idx('四年級_男')]),
      Y4F: num(cols[idx('四年級_女')]),
      Y5M: num(cols[idx('五年級_男')]),
      Y5F: num(cols[idx('五年級_女')]),
      Y6M: num(cols[idx('六年級_男')]),
      Y6F: num(cols[idx('六年級_女')]),
      Y7M: num(cols[idx('七年級_男')]),
      Y7F: num(cols[idx('七年級_女')]),
      ExtM: num(cols[idx('延修生_男')]),
      ExtF: num(cols[idx('延修生_女')]),
    };
  };
  const data = lines.map(mapLine);
  const excludeCodes = new Set([
    '0000', '1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000', '9000', 'A000', 'B000'
  ]);
  return data.filter((d) => !excludeCodes.has(d.DeptCode));
}

const CSV_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname), './department_people.csv'
);
const ntuDepartments = parseDepartmentsCSV(CSV_PATH);
// console.log(`Parsed ${ntuDepartments.length} departments from CSV.`);
// console.log(`Total students count: ${ntuDepartments.reduce((sum, d) => sum + d.Total, 0)}`);
// console.log('Sample department data:', ntuDepartments.slice(0, 3));

const args = process.argv.slice(2);

const COUNT = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : 10000;
const DRY_RUN = args.includes('--dry');
const CURRENT_SCHOOL_YEAR = 113; // 113學年度 (Data captured 114/03/25, which is 113-2 semester)

function random_chinese_name() {
  function random(a, l) {
    var x = [];
    x.push(a[Math.ceil(Math.random() * a.length)]);
    while (l > 1) {
      x.push(a[Math.ceil(Math.random() * a.length)]);
      l--;
    }
    return x.join("");
  }

  const lastName = random(
    ("李王張劉陳楊黃趙周吳徐孫朱馬胡郭林何高" +
      "梁鄭羅宋謝唐韓曹許鄧蕭馮曾程蔡彭潘袁於" +
      "董餘蘇葉呂魏蔣田杜丁沈姜範江傅鐘盧汪戴崔" +
      "任陸廖姚方金邱夏譚韋賈鄒石熊孟秦閻薛侯雷" +
      "白龍段郝孔邵史毛常萬顧賴武康賀嚴尹錢施牛洪龔").split("")
  )
  const firstName = random(
    ("世中仁伶佩佳俊信倫偉傑儀元冠凱君哲" +
      "國冠宏志忠思怡怡慧慶文昌明智星昊昕晨柏榮欣正" +
      "民永玉玲珊珍琪瑜瑞真祥秀秋穎立維美翔翰聖育良" +
      "芬芳英菁華裕豪貞賢郁鈴銘雅雯霖青靜韻鴻麗龍").split(""),
    Math.ceil(Math.random() * 2)
  );
  return lastName + firstName;
}

/**
 * Generates an NTU student ID based on the department code, year level, and gender.
 * NTU Student ID Format (for undergraduate students):
 * - [Admission Year (last 2 digits of ROC year, e.g., 113 for 2024)]
 * - [Department Code (3 digits)]
 * - [Serial Number (3 digits)]
 * Note: The DeptCode is typically the last 3 digits of the 4-digit code (e.g., 101 for 1010).
 * For this script, we'll use the last 3 digits of the 4-digit code.
 *
 * @param {string} deptCode 4-digit department code (e.g., '1010')
 * @param {number} yearLevel 1-7 for in-school, 8 for extended (延修生)
 * @param {string} sex 'male' or 'female'
 * @param {number} index The sequential number (e.g., 0 for the 1st student, 1 for the 2nd)
 */
function ntuStudentId(deptCode, yearLevel, index) {
  let admissionYear;
  if (yearLevel === 8) {
    // Extended students (延修生) are typically 5th year or more. We'll simulate 5th-7th years.
    admissionYear = CURRENT_SCHOOL_YEAR - faker.helpers.arrayElement([4, 5, 6]);
  } else {
    admissionYear = CURRENT_SCHOOL_YEAR - (yearLevel - 1);
  }
  const admissionYear2D = String(admissionYear).slice(-2);
  const deptCode3D = deptCode.slice(1, 4);
  const serialNumber = String(index + 1).padStart(3, '0');
  return `${admissionYear2D}${deptCode3D}${serialNumber}`;
}


function ntuEmailFromID(studentID) {
  const domain = faker.helpers.arrayElement(['g.ntu.edu.tw', 'ntu.edu.tw']);
  // Use the student ID as the username for the email
  return `${studentID}@${domain}`;
}

function twMobile() {
  return `09${faker.string.numeric(8)}`;
}

function randomPasswordHash(len = 60) {
  return faker.string.hexadecimal({ length: len, prefix: '$2b$10$' });
}

function mapYearLevelToRegisterTime(yearLevel, schoolYear) {
  let yearOffset; // The number of years *before* the current school year's start (e.g., Y1 is 0 years before)
  if (yearLevel === 8) {
    // For Extended students, randomly place their registration in the last 3 years of expected entry
    yearOffset = faker.helpers.arrayElement([4, 5, 6]);
  } else {
    yearOffset = yearLevel - 1;
  }
  const admissionYear = schoolYear - yearOffset;
  const admissionDate = faker.date.between({
    from: new Date(admissionYear + 1911, 8, 1), // Aug 1
    to: new Date(admissionYear + 1911, 9, 30), // Sep 30
  });
  return admissionDate;
}

function buildUsers(n) {
  const users = [];
  const uniqEmails = new Set();
  const uniqPhones = new Set();

  for (const dept of ntuDepartments) {
    // Iterate over year levels 1 through 7, and the Extended level (8)
    for (let yearLevel = 1; yearLevel <= 8; yearLevel++) {
      const yearKey = yearLevel <= 7 ? `Y${yearLevel}` : 'Ext';

      const maxMale = dept[`${yearKey}M`] || 0;
      const maxFemale = dept[`${yearKey}F`] || 0;

      if (maxMale === 0 && maxFemale === 0) continue;

      const baseCounterKey = `${dept.DeptCode}_${yearLevel}`;

      for (let i = 0; i < maxMale + maxFemale; i++) {
        const sex = (i < maxMale) ? 'Male' : 'Female';
        const studentID = ntuStudentId(dept.DeptCode, yearLevel, i);
        const email = ntuEmailFromID(studentID);
        if (uniqEmails.has(email)) continue;
        uniqEmails.add(email);

        // Ensure phone uniqueness
        let phoneVal = twMobile();
        while (uniqPhones.has(phoneVal)) {
          phoneVal = twMobile();
        }
        uniqPhones.add(phoneVal);
        const registerTime = mapYearLevelToRegisterTime(yearLevel, CURRENT_SCHOOL_YEAR);

        users.push({
          name: random_chinese_name(),
          email: email,
          sex: sex,
          password_hash: randomPasswordHash(),
          phone: phoneVal,
          register_time: registerTime,
        });
      }
    }
  }
  // Truncate the users array to match the total count from the data, which is the implicit COUNT.
  // The loop logic ensures we don't over-generate, so this is just a final check.
  return faker.helpers.shuffle(users).slice(0, n);
}

async function insertUsers(users) {
  const cs = new pgp.helpers.ColumnSet(
    [
      { name: 'name' },
      { name: 'email' },
      { name: 'sex' },
      { name: 'password_hash' },
      { name: 'phone' },
      { name: 'register_time' },
    ],
    { table: { table: 'user', schema: 'jojo' } }
  );
  const query = pgp.helpers.insert(users, cs);
  return db.none(query);
}

async function main() {
  const users = buildUsers(COUNT);
  if (DRY_RUN) {
    console.log(`[dry] Would insert ${users.length} users (total based on department counts):`);
    console.table(
      users.map((u) => ({
        StudentID: u.email.split('@')[0],
        Dept: u.email.split('@')[0].slice(2, 5),
        Year: u.email.split('@')[0].slice(0, 2),
        Name: u.name,
        Email: u.email,
        Sex: u.sex,
        RegisterTime: u.register_time.toISOString().substring(0, 10)
      }))
    );
    return;
  }
  try {
    await insertUsers(users);
    console.log(`Inserted ${users.length} users into jojo.user`);
  } catch (err) {
    console.error('Failed to insert users:', err);
    process.exitCode = 1;
  } finally {
    pgp.end();
  }
}

main();
