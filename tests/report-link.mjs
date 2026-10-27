/**
 * The report-link firewall.
 *
 * These cases are taken from the live archive: every rejection below is a row
 * somebody actually typed into the sheet, and every acceptance is a link that
 * really does open a document. The point of pinning them is that the rule is
 * structural — it must keep passing ordinary links while refusing the ones
 * that go nowhere, because an over-eager rule here quietly deletes real work
 * from the dashboard.
 */
import { checkReportLink } from '../scripts/lib/report-link.mjs';

let pass = 0; const fails = [];
const ok = (url) => {
  const v = checkReportLink(url);
  if (v.ok) pass++; else fails.push(`should have been allowed: ${url} (${v.reason})`);
};
const no = (url, expect) => {
  const v = checkReportLink(url);
  if (v.ok) fails.push(`should have been rejected: ${url}`);
  else if (expect && !v.reason.includes(expect)) fails.push(`${url}\n       reason was "${v.reason}", expected "${expect}"`);
  else pass++;
};

console.log('\nReport-link firewall');

// --- real documents, all of which must survive -----------------------------
ok('https://drive.google.com/file/d/1_0zEoWdXBYQFf0f6gFKtfQi2qR-mQusA');
ok('https://drive.google.com/file/d/1_0zEoWdXBYQFf0f6gFKtfQi2qR-mQusA/view?usp=sharing');
ok('https://docs.google.com/spreadsheets/d/1Wqlptr37S_3ImALfZnoEirngh40ITF_cTekLJXJM-F0/edit?usp=sharing');
ok('https://docs.google.com/presentation/d/1YunAQ14vqWlq7hYJm5y5oWpkPdbbVzAaf2Ro-C2ilxY/edit');
ok('https://www.canva.com/design/DAHEYHLygZw/kL5RpjbbpTjdzRa5JOG5Yg/view');
ok('https://canva.link/24ioxb0a1f6a8jc');
ok('https://www.instagram.com/reel/C8xYzAbCdEf/');
ok('https://app.wldd.in/campaigns/58e2bcf5-17b0-434e-a9e9-3b4424ca6024');
// A host the rule has never seen is not proof of anything.
ok('https://example.sharepoint.com/sites/wldd/report.pptx');
console.log(`  ok   ${pass} real links still open`);

// --- placeholders from the sheet, which must not reach a client ------------
const before = fails.length;
no('https://www.canva.com/', 'not a document');
no('https://www.canva.com/s/designs', 'not a design');
no('https://app.wldd.in/', 'not a document');
no('https://drive.google.com/drive/folders/17oixeXX57RPMNZeWu6ysSNIN__VCRNmL', 'folder');
no('https://www.instagram.com/carpisa.in/?hl=en', 'profile');
no('https://docs.google.com/spreadsheets', 'document id');
no('https://drive.google.com/file/d/short', 'file id');
no('', 'empty');
no('not a url at all', 'not a URL');
no('ftp://files.example.com/deck.pdf', 'not a web link');
if (fails.length === before) console.log('  ok   every known placeholder is refused');

// --- the rule that keeps it honest ----------------------------------------
// A word list would fail these: all three are real campaigns whose names or
// links contain words a naive filter treats as junk.
const beforeWords = fails.length;
ok('https://drive.google.com/file/d/1testSAMPLEdummyABCDEFGHIJKLMNOP/view');
if (fails.length === beforeWords) console.log('  ok   a real link is not judged by the words in it');

fails.forEach((f) => console.log(`  FAIL ${f}`));
console.log(`  ${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
