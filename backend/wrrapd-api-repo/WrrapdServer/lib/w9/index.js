/**
 * Electronic Form W-9 (Rev. March 2024): fills the official IRS PDF (lib/w9/fw9.pdf), stamps the
 * electronic signature and an audit line, and stores the filled copy encrypted (AES-256-GCM).
 *
 * Electronic W-9 rules (Treas. Reg. 31.3406(h)-3(e)): the signer is the logged-in applicant, the jurat is
 * signed electronically under penalties of perjury, every submission is logged (time, IP, browser, SHA-256
 * of the filled PDF), and a hard copy can be produced on request. The full TIN lives only inside the
 * encrypted PDF; the index keeps the last four digits.
 *
 * Env: W9_ENCRYPTION_KEY (64 hex chars). Losing it makes stored W-9s unreadable.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const FORM_PATH = path.join(__dirname, 'fw9.pdf');
const STORE_DIR = path.join(__dirname, '..', '..', 'data', 'w9');
const INDEX_FILE = path.join(STORE_DIR, 'index.json');
const REQUESTER = 'Wrrapd Inc.\n7901 4th Street N, Ste. 300\nSt. Petersburg, FL 33702';
const FORM_REVISION = 'Form W-9 (Rev. March 2024)';

const P = 'topmostSubform[0].Page1[0].';
const B = `${P}Boxes3a-b_ReadOrder[0].`;
const CLASS_BOXES = {
  individual: `${B}c1_1[0]`,
  c_corp: `${B}c1_1[1]`,
  s_corp: `${B}c1_1[2]`,
  partnership: `${B}c1_1[3]`,
  trust_estate: `${B}c1_1[4]`,
  llc: `${B}c1_1[5]`,
  other: `${B}c1_1[6]`,
};

function encryptionKey() {
  const hex = String(process.env.W9_ENCRYPTION_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('W9_ENCRYPTION_KEY is not set');
  return Buffer.from(hex, 'hex');
}

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([Buffer.from('W9E1'), iv, cipher.getAuthTag(), body]);
}

function decrypt(buf) {
  if (buf.subarray(0, 4).toString() !== 'W9E1') throw new Error('Unknown W-9 file format');
  const iv = buf.subarray(4, 16);
  const tag = buf.subarray(16, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()]);
}

function clean(v, max = 120) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * @returns {{ ok: true, form: object } | { ok: false, error: string }}
 */
function validate(input) {
  const f = input && typeof input === 'object' ? input : {};
  const form = {
    name: clean(f.name, 100),
    businessName: clean(f.businessName, 100),
    classification: clean(f.classification, 20),
    llcClass: clean(f.llcClass, 1).toUpperCase(),
    otherText: clean(f.otherText, 60),
    foreignPartners: !!f.foreignPartners,
    exemptPayeeCode: clean(f.exemptPayeeCode, 4),
    fatcaCode: clean(f.fatcaCode, 4).toUpperCase(),
    address: clean(f.address, 100),
    cityStateZip: clean(f.cityStateZip, 100),
    accountNumbers: clean(f.accountNumbers, 60),
    tinType: f.tinType === 'ein' ? 'ein' : 'ssn',
    tin: String(f.tin || '').replace(/\D/g, ''),
    backupWithholding: !!f.backupWithholding,
    signature: clean(f.signature, 100),
  };
  if (!form.name) return { ok: false, error: 'Enter your name as shown on your income tax return (line 1).' };
  if (!CLASS_BOXES[form.classification]) return { ok: false, error: 'Choose a federal tax classification (line 3a).' };
  if (form.classification === 'llc' && !['C', 'S', 'P'].includes(form.llcClass)) {
    return { ok: false, error: 'For an LLC, enter its tax classification: C, S or P.' };
  }
  if (form.classification === 'other' && !form.otherText) return { ok: false, error: 'Describe the "Other" classification.' };
  if (!['partnership', 'trust_estate', 'llc'].includes(form.classification)) form.foreignPartners = false;
  if (!form.address || !form.cityStateZip) return { ok: false, error: 'Enter your address, city, state and ZIP code (lines 5 and 6).' };
  if (form.tin.length !== 9) return { ok: false, error: 'Enter a 9-digit SSN or EIN.' };
  if (/^(\d)\1{8}$/.test(form.tin) || (form.tinType === 'ssn' && /^(000|666)/.test(form.tin))) {
    return { ok: false, error: 'That taxpayer identification number is not valid.' };
  }
  if (!/^\/[^/]+\/$/.test(form.signature)) return { ok: false, error: 'Sign with slashes around your full legal name, like /John Doe/.' };
  const signed = form.signature.slice(1, -1).trim().toLowerCase().replace(/\s+/g, ' ');
  // An entity's W-9 is signed by an authorized person, so only an individual's signature must match line 1.
  if (form.classification === 'individual' && signed !== form.name.toLowerCase().replace(/\s+/g, ' ')) {
    return { ok: false, error: 'Your signature must match the name on line 1.' };
  }
  return { ok: true, form };
}

function nyDate(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' }).format(d);
}

async function fillPdf(form, audit) {
  const pdf = await PDFDocument.load(fs.readFileSync(FORM_PATH));
  const acro = pdf.getForm();
  const text = (name, value) => {
    if (value) acro.getTextField(`${P}${name}`).setText(value);
  };
  text('f1_01[0]', form.name);
  text('f1_02[0]', form.businessName);
  acro.getCheckBox(CLASS_BOXES[form.classification]).check();
  if (form.classification === 'llc') acro.getTextField(`${B}f1_03[0]`).setText(form.llcClass);
  if (form.classification === 'other') acro.getTextField(`${B}f1_04[0]`).setText(form.otherText);
  if (form.foreignPartners) acro.getCheckBox(`${B}c1_2[0]`).check();
  text('f1_05[0]', form.exemptPayeeCode);
  text('f1_06[0]', form.fatcaCode);
  text('Address_ReadOrder[0].f1_07[0]', form.address);
  text('Address_ReadOrder[0].f1_08[0]', form.cityStateZip);
  acro.getTextField(`${P}f1_09[0]`).setText(REQUESTER);
  text('f1_10[0]', form.accountNumbers);
  if (form.tinType === 'ssn') {
    text('f1_11[0]', form.tin.slice(0, 3));
    text('f1_12[0]', form.tin.slice(3, 5));
    text('f1_13[0]', form.tin.slice(5));
  } else {
    text('f1_14[0]', form.tin.slice(0, 2));
    text('f1_15[0]', form.tin.slice(2));
  }
  acro.flatten();

  const page = pdf.getPage(0);
  const { height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const plain = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.05, 0.05, 0.3);
  if (form.backupWithholding) {
    // Certification item 2 crossed out, as the instructions require when notified of backup withholding.
    for (const [y, x2] of [[487, 576], [498, 576], [508, 262]]) {
      page.drawLine({ start: { x: 46, y: height - y }, end: { x: x2, y: height - y }, thickness: 1, color: rgb(0.7, 0, 0) });
    }
  }
  page.drawText(form.signature, { x: 182, y: height - 596, size: 11, font, color: ink });
  page.drawText(nyDate(audit.signedAt), { x: 410, y: height - 596, size: 10, font: plain, color: ink });
  const stamp =
    `Signed electronically under penalties of perjury on ${audit.signedAt.toISOString()} ` +
    `by the logged-in applicant ${audit.email} (IP ${audit.ip || 'unknown'}). Wrrapd W-9 ${audit.id}.`;
  page.drawText(stamp, { x: 36, y: height - 16, size: 6, font: plain, color: rgb(0.3, 0.3, 0.3), maxWidth: 540 });
  pdf.setTitle(`${FORM_REVISION} — ${form.name}`);
  pdf.setProducer('Wrrapd electronic W-9');
  return Buffer.from(await pdf.save());
}

function readIndex() {
  try {
    const rows = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeIndex(rows) {
  fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, INDEX_FILE);
}

/**
 * @param {{ fields: object, suite: string, applicationId: string, email: string, ip?: string, userAgent?: string }} req
 */
async function submit(req) {
  const v = validate(req.fields);
  if (!v.ok) return v;
  encryptionKey();
  const suite = ['wrapstar', 'wraprider', 'joyrider'].includes(req.suite) ? req.suite : '';
  const email = clean(req.email, 200).toLowerCase();
  if (!suite || !email) return { ok: false, error: 'Missing applicant details.' };
  const id = `w9_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  const audit = { id, signedAt: new Date(), email, ip: clean(req.ip, 64) };
  const pdf = await fillPdf(v.form, audit);
  const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
  fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(STORE_DIR, `${id}.pdf.enc`), encrypt(pdf), { mode: 0o600 });
  const row = {
    id,
    suite,
    applicationId: clean(req.applicationId, 40),
    email,
    name: v.form.name,
    businessName: v.form.businessName,
    classification: v.form.classification,
    tinType: v.form.tinType,
    tinLast4: v.form.tin.slice(-4),
    backupWithholding: v.form.backupWithholding,
    signedAt: audit.signedAt.toISOString(),
    ip: audit.ip,
    userAgent: clean(req.userAgent, 300),
    sha256,
    formRevision: FORM_REVISION,
  };
  const rows = readIndex();
  for (const r of rows) {
    if (r.email === email && r.suite === suite && !r.supersededBy) r.supersededBy = id;
  }
  rows.push(row);
  writeIndex(rows);
  return { ok: true, w9: row };
}

function list(filter = {}) {
  const email = clean(filter.email, 200).toLowerCase();
  return readIndex().filter((r) => !email || r.email === email);
}

function readPdf(id) {
  if (!/^w9_[a-z0-9]+_[a-f0-9]{10}$/.test(String(id || ''))) return null;
  const row = readIndex().find((r) => r.id === id);
  if (!row) return null;
  const pdf = decrypt(fs.readFileSync(path.join(STORE_DIR, `${id}.pdf.enc`)));
  if (crypto.createHash('sha256').update(pdf).digest('hex') !== row.sha256) throw new Error('W-9 file failed its integrity check');
  return { row, pdf };
}

module.exports = { submit, list, readPdf, validate };
