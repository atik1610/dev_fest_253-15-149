'use client';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { buildPackage } from '../lib/pkg';

const T = {
  en: { app: 'Tender Package Builder', step1: '1. Load tender requirements (requirements.json)', step2: '2. Upload PDF files', step3: '3. Match files, enter expiry dates, check status',
    tender: 'Tender', entity: 'Procuring entity', bidder: 'Bidder', deadline: 'Submission deadline', file: 'File', none: '— choose file —', expiry: 'Expiry date',
    remove: 'Remove', pages: 'pages', dup: 'Duplicate of', notPdf: 'Not a PDF file. Only PDF files are accepted.', bad: 'File is damaged or password-protected.', limit: 'Limit reached (30 files / 50 MB).',
    gen: 'Generate & download package', why: 'Fix these before generating:', opt: 'optional', req: 'required', unmatch: 'Undo match', busy: 'Working...', ready: 'All checks passed. Ready to generate.', empty: 'No files uploaded yet.',
    s: { missing: 'Missing', needed: 'Expiry date needed', expired: 'Expired', optional: 'Not provided', ok: 'OK' } },
  bn: { app: 'টেন্ডার প্যাকেজ বিল্ডার', step1: '১. টেন্ডারের চাহিদা লোড করুন (requirements.json)', step2: '২. পিডিএফ ফাইল আপলোড করুন', step3: '৩. ফাইল মিলান, মেয়াদের তারিখ দিন, অবস্থা দেখুন',
    tender: 'টেন্ডার', entity: 'ক্রয়কারী প্রতিষ্ঠান', bidder: 'দরদাতা', deadline: 'জমার শেষ তারিখ', file: 'ফাইল', none: '— ফাইল বাছাই করুন —', expiry: 'মেয়াদ শেষের তারিখ',
    remove: 'মুছুন', pages: 'পৃষ্ঠা', dup: 'ডুপ্লিকেট:', notPdf: 'এটি পিডিএফ নয়। শুধু পিডিএফ ফাইল নেওয়া হয়।', bad: 'ফাইলটি নষ্ট অথবা পাসওয়ার্ড দেওয়া।', limit: 'সীমা শেষ (সর্বোচ্চ ৩০টি ফাইল / ৫০ এমবি)।',
    gen: 'প্যাকেজ তৈরি ও ডাউনলোড করুন', why: 'তৈরি করার আগে এগুলো ঠিক করুন:', opt: 'ঐচ্ছিক', req: 'আবশ্যক', unmatch: 'মিল বাতিল', busy: 'কাজ চলছে...', ready: 'সব ঠিক আছে। প্যাকেজ তৈরি করা যাবে।', empty: 'এখনো কোনো ফাইল আপলোড হয়নি।',
    s: { missing: 'অনুপস্থিত', needed: 'মেয়াদের তারিখ দিন', expired: 'মেয়াদোত্তীর্ণ', optional: 'দেওয়া হয়নি', ok: 'ঠিক আছে' } },
};
const BLOCK = ['missing', 'needed', 'expired'];

function statusOf(r, fid, exp, deadline) {
  if (!fid) return r.mandatory ? 'missing' : 'optional';
  if (r.has_expiry) { if (!exp) return 'needed'; if (exp < deadline) return 'expired'; } // same day = OK
  return 'ok';
}

export default function Home() {
  const [lang, setLang] = useState('en');
  const [data, setData] = useState(null);
  const [files, setFiles] = useState([]);
  const [match, setMatch] = useState({}); // reqId -> fileId
  const [exp, setExp] = useState({});     // reqId -> date
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const t = T[lang];

  async function loadReq(e) {
    try { const d = JSON.parse(await e.target.files[0].text()); if (!d.tender || !Array.isArray(d.requirements)) throw 0; setData(d); setErrs([]); }
    catch { setErrs(['Invalid requirements.json']); }
  }

  async function addFiles(list) {
    const bad = []; const cur = [...files]; let total = cur.reduce((s, f) => s + f.size, 0);
    for (const f of list) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && /\.pdf$/i.test(f.name);
      if (!isPdf) { bad.push(`${f.name}: ${t.notPdf}`); continue; }
      if (cur.length >= 30 || total + f.size > 50 * 1048576) { bad.push(`${f.name}: ${t.limit}`); continue; }
      let pages;
      try { pages = (await PDFDocument.load(bytes)).getPageCount(); } catch { bad.push(`${f.name}: ${t.bad}`); continue; }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
      cur.push({ id: crypto.randomUUID(), name: f.name, size: f.size, pages, hash, bytes }); total += f.size;
    }
    setFiles(cur); setErrs(bad);
  }

  function removeFile(id) {
    setFiles(files.filter((f) => f.id !== id));
    setMatch(Object.fromEntries(Object.entries(match).filter(([, v]) => v !== id)));
  }
  function setM(rid, fid) {
    const m = Object.fromEntries(Object.entries(match).filter(([k, v]) => k !== rid && v !== fid));
    if (fid) m[rid] = fid;
    setMatch(m);
  }
  const first = (f) => files.find((x) => x.hash === f.hash); // first uploaded copy
  const isDup = (f) => files.filter((x) => x.hash === f.hash).length > 1;
  // a file is blocked for requirement rid if it (or an identical copy) is matched to a different requirement
  const blocked = (f, rid) => Object.entries(match).some(([k, v]) => k !== rid && files.find((x) => x.id === v)?.hash === f.hash);

  const reqs = data ? [...data.requirements].sort((a, b) => a.order - b.order) : [];
  const dl = data?.tender.submission_deadline;
  const st = Object.fromEntries(reqs.map((r) => [r.id, statusOf(r, match[r.id], exp[r.id], dl)]));
  const problems = reqs.filter((r) => BLOCK.includes(st[r.id]));
  const title = (r) => (lang === 'bn' ? r.title_bn || r.title_en : r.title_en);

  async function generate() {
    setBusy(true);
    try {
      const items = reqs.filter((r) => match[r.id]).map((r) => ({ req: r, file: files.find((f) => f.id === match[r.id]) }));
      const bytes = await buildPackage(data.tender, items);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = `${data.tender.tender_id}_Package.pdf`; a.click();
    } catch (e) { setErrs([String(e)]); }
    setBusy(false);
  }

  return (
    <main>
      <header>
        <h1>{t.app}</h1>
        <div className="lang">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'bn' ? 'on' : ''} onClick={() => setLang('bn')}>বাংলা</button>
        </div>
      </header>

      {errs.length > 0 && <div className="err" role="alert">{errs.map((e, i) => <div key={i}>{e}</div>)}</div>}

      <section>
        <h2>{t.step1}</h2>
        <input type="file" accept=".json,application/json" onChange={loadReq} />
        {data && (
          <dl className="tender">
            <dt>{t.tender}</dt><dd>{data.tender.tender_id} — {data.tender.title}</dd>
            <dt>{t.entity}</dt><dd>{data.tender.procuring_entity}</dd>
            <dt>{t.bidder}</dt><dd>{data.tender.bidder}</dd>
            <dt>{t.deadline}</dt><dd>{dl}</dd>
          </dl>
        )}
      </section>

      <section>
        <h2>{t.step2}</h2>
        <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
        {files.length === 0 ? <p className="muted">{t.empty}</p> : (
          <ul className="files">
            {files.map((f) => (
              <li key={f.id}>
                <b>{f.name}</b> <span className="muted">{f.pages} {t.pages}</span>
                {isDup(f) && <span className="badge dup">{t.dup} {first(f).id === f.id ? files.find((x) => x.hash === f.hash && x.id !== f.id).name : first(f).name}</span>}
                <button onClick={() => removeFile(f.id)}>{t.remove}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && (
        <section>
          <h2>{t.step3}</h2>
          <table>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id} className={'row ' + st[r.id]}>
                  <td className="n">{r.order}</td>
                  <td><b>{title(r)}</b><br /><span className="muted">{r.mandatory ? t.req : t.opt}</span></td>
                  <td>
                    <select aria-label={t.file} value={match[r.id] || ''} onChange={(e) => setM(r.id, e.target.value)}>
                      <option value="">{t.none}</option>
                      {files.map((f) => <option key={f.id} value={f.id} disabled={blocked(f, r.id) || (match[r.id] !== f.id && Object.values(match).includes(f.id))}>{f.name}</option>)}
                    </select>
                    {match[r.id] && <button onClick={() => setM(r.id, '')}>{t.unmatch}</button>}
                    {r.has_expiry && match[r.id] && (
                      <label className="exp">{t.expiry}: <input type="date" value={exp[r.id] || ''} onChange={(e) => setExp({ ...exp, [r.id]: e.target.value })} /></label>
                    )}
                  </td>
                  <td><span className={'badge ' + st[r.id]}>{t.s[st[r.id]]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="gen">
            {problems.length > 0 ? (
              <div className="why"><b>{t.why}</b><ul>{problems.map((r) => <li key={r.id}>{title(r)} — {t.s[st[r.id]]}</li>)}</ul></div>
            ) : <p className="ok">{t.ready}</p>}
            <button className="primary" disabled={problems.length > 0 || busy} onClick={generate}>{busy ? t.busy : t.gen}</button>
          </div>
        </section>
      )}
    </main>
  );
}
