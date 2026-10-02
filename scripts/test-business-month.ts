import { getBusinessMonth } from '../lib/utils/businessMonth';

const testCases: Array<{
  inputDate: string;
  expectedLabel: string;
  expectedStart: string;
  expectedEnd: string;
  expectedKey: string;
}> = [
  { inputDate: '2026-09-05', expectedLabel: 'August 2026', expectedStart: '2026-08-06', expectedEnd: '2026-09-05', expectedKey: '2026-08' },
  { inputDate: '2026-09-06', expectedLabel: 'September 2026', expectedStart: '2026-09-06', expectedEnd: '2026-10-05', expectedKey: '2026-09' },
  { inputDate: '2026-10-05', expectedLabel: 'September 2026', expectedStart: '2026-09-06', expectedEnd: '2026-10-05', expectedKey: '2026-09' },
  { inputDate: '2026-10-06', expectedLabel: 'October 2026', expectedStart: '2026-10-06', expectedEnd: '2026-11-05', expectedKey: '2026-10' },
  { inputDate: '2026-10-20', expectedLabel: 'October 2026', expectedStart: '2026-10-06', expectedEnd: '2026-11-05', expectedKey: '2026-10' },
  { inputDate: '2026-11-05', expectedLabel: 'October 2026', expectedStart: '2026-10-06', expectedEnd: '2026-11-05', expectedKey: '2026-10' },
  { inputDate: '2026-11-06', expectedLabel: 'November 2026', expectedStart: '2026-11-06', expectedEnd: '2026-12-05', expectedKey: '2026-11' },
  { inputDate: '2026-12-31', expectedLabel: 'December 2026', expectedStart: '2026-12-06', expectedEnd: '2027-01-05', expectedKey: '2026-12' },
  { inputDate: '2027-01-01', expectedLabel: 'December 2026', expectedStart: '2026-12-06', expectedEnd: '2027-01-05', expectedKey: '2026-12' },
  { inputDate: '2027-01-05', expectedLabel: 'December 2026', expectedStart: '2026-12-06', expectedEnd: '2027-01-05', expectedKey: '2026-12' },
  { inputDate: '2027-01-06', expectedLabel: 'January 2027', expectedStart: '2027-01-06', expectedEnd: '2027-02-05', expectedKey: '2027-01' },
  { inputDate: '2027-02-28', expectedLabel: 'February 2027', expectedStart: '2027-02-06', expectedEnd: '2027-03-05', expectedKey: '2027-02' },
  { inputDate: '2027-03-01', expectedLabel: 'February 2027', expectedStart: '2027-02-06', expectedEnd: '2027-03-05', expectedKey: '2027-02' },
  { inputDate: '2027-03-05', expectedLabel: 'February 2027', expectedStart: '2027-02-06', expectedEnd: '2027-03-05', expectedKey: '2027-02' },
  { inputDate: '2027-03-06', expectedLabel: 'March 2027', expectedStart: '2027-03-06', expectedEnd: '2027-04-05', expectedKey: '2027-03' },
  // Leap year 2028 (Feb has 29 days)
  { inputDate: '2028-02-28', expectedLabel: 'February 2028', expectedStart: '2028-02-06', expectedEnd: '2028-03-05', expectedKey: '2028-02' },
  { inputDate: '2028-02-29', expectedLabel: 'February 2028', expectedStart: '2028-02-06', expectedEnd: '2028-03-05', expectedKey: '2028-02' },
  { inputDate: '2028-03-05', expectedLabel: 'February 2028', expectedStart: '2028-02-06', expectedEnd: '2028-03-05', expectedKey: '2028-02' },
  { inputDate: '2028-03-06', expectedLabel: 'March 2028', expectedStart: '2028-03-06', expectedEnd: '2028-04-05', expectedKey: '2028-03' },
];

let failed = 0;

console.log('--- RUNNING BUSINESS MONTH TEST CASES ---');
for (const tc of testCases) {
  const bm = getBusinessMonth(tc.inputDate);
  const passLabel = bm.label === tc.expectedLabel;
  const passStart = bm.startDateStr === tc.expectedStart;
  const passEnd = bm.endDateStr === tc.expectedEnd;
  const passKey = bm.monthKey === tc.expectedKey;

  const passed = passLabel && passStart && passEnd && passKey;
  if (!passed) {
    failed++;
    console.error(`FAIL: ${tc.inputDate}`);
    console.error(`  Expected: label="${tc.expectedLabel}", start="${tc.expectedStart}", end="${tc.expectedEnd}", key="${tc.expectedKey}"`);
    console.error(`  Actual:   label="${bm.label}", start="${bm.startDateStr}", end="${bm.endDateStr}", key="${bm.monthKey}"`);
  } else {
    console.log(`PASS: ${tc.inputDate} -> ${bm.label} (${bm.rangeLabel}) [key=${bm.monthKey}]`);
  }
}

if (failed === 0) {
  console.log(`\nALL ${testCases.length} TEST CASES PASSED SUCCESSFULLY!`);
} else {
  console.error(`\n${failed} test case(s) failed.`);
  process.exit(1);
}
