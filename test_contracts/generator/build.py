"""Build the AtliQ synthetic test set.

Run:  python3 -I build.py      (from this folder; writes into ../)
Outputs: contracts/, support/, edge/, formats/, expected_results.json, expected_results.md
and a self-check that every expected quote really appears in its document.
"""
import json
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import templates as T  # noqa: E402
from cases import CASES  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = {k: os.path.join(ROOT, k) for k in ('contracts', 'support', 'edge', 'formats')}
for p in OUT.values():
    os.makedirs(p, exist_ok=True)

# ---------------------------------------------------------------------------
# Long-contract filler (TC48): sections 16-60, with the trap in section 57
# ---------------------------------------------------------------------------
LONG_TOPICS = [
    ('GOVERNANCE', 'The Parties shall each appoint a project sponsor and a project manager.', 'The project managers shall meet weekly to review progress, risks and open decisions.'),
    ('STEERING COMMITTEE', 'A steering committee of senior representatives shall meet monthly.', 'The committee shall resolve escalations within ten (10) business days.'),
    ('SERVICE LEVELS', 'The Supplier shall meet the service levels in the service level schedule agreed at kick-off.', 'Service levels apply only after go-live and stabilisation of thirty (30) days.'),
    ('SERVICE CREDITS', 'If a service level is missed, the Client may claim a service credit of up to two percent (2%) of the monthly support fee.', 'Service credits in any month shall not exceed ten percent (10%) of that month\'s support fee.'),
    ('CHANGE CONTROL', 'Either Party may request a change by submitting a written change request.', 'No change is binding until signed by both project sponsors.'),
    ('ACCEPTANCE', 'The Client shall test each Deliverable within ten (10) business days of delivery.', 'A Deliverable is deemed accepted if no material defect is notified within that period.'),
    ('PROJECT PLAN', 'The Supplier shall maintain a project plan and share it fortnightly.', 'Changes to the plan that affect target dates require a change request.'),
    ('REPORTING', 'The Supplier shall provide a monthly status report covering progress, risks and spend.', 'Reports shall be shared in the format agreed at kick-off.'),
    ('AUDIT', 'The Client may audit the Supplier\'s records relating to the Fees once a year on thirty (30) days\' notice.', 'Audits shall be conducted during business hours and at the Client\'s cost.'),
    ('BUSINESS CONTINUITY', 'The Supplier shall maintain a business continuity plan for its delivery centre.', 'The Supplier shall test the plan at least once a year.'),
    ('INFORMATION SECURITY', 'The Supplier shall follow information security practices consistent with ISO 27001.', 'The Supplier shall notify the Client of any security incident affecting Client data within seventy-two (72) hours.'),
    ('ACCESS CONTROL', 'Access to Client systems shall be limited to named Supplier personnel.', 'The Supplier shall revoke access within one (1) business day of a person leaving the project.'),
    ('PERSONNEL', 'The Supplier shall assign suitably qualified personnel.', 'The Client may request the replacement of any person on reasonable grounds.'),
    ('KEY PERSONNEL', 'The Supplier shall not replace its named project manager without reasonable notice.', 'Any replacement shall have equivalent experience.'),
    ('BACKGROUND CHECKS', 'The Supplier shall carry out standard background checks on personnel with access to Client systems.', 'Checks shall comply with applicable law.'),
    ('SUBCONTRACTING', 'The Supplier may subcontract with the Client\'s written approval, not to be unreasonably withheld.', 'The Supplier remains responsible for its subcontractors.'),
    ('TRANSITION-IN', 'The Client shall provide documentation of existing systems within two (2) weeks of the Effective Date.', 'Delays in transition-in information extend the affected target dates.'),
    ('TRANSITION-OUT', 'On expiry the Supplier shall provide reasonable transition assistance for up to thirty (30) days at the rates in Schedule 1.', 'The Client shall pay for transition assistance on the usual payment terms.'),
    ('DOCUMENTATION', 'The Supplier shall provide technical and user documentation for each Deliverable.', 'Documentation shall be in English.'),
    ('TRAINING', 'The Supplier shall provide up to three (3) training sessions for Client users.', 'Additional training is chargeable at the rates in Schedule 1.'),
    ('KNOWLEDGE TRANSFER', 'The Supplier shall hold knowledge-transfer sessions before handover.', 'The Client shall make suitable personnel available for those sessions.'),
    ('OPEN SOURCE', 'The Supplier may use open-source components under permissive licences.', 'The Supplier shall list material open-source components in the documentation.'),
    ('THIRD-PARTY SOFTWARE', 'The Client shall procure licences for third-party software it requires.', 'The Supplier is not responsible for defects in third-party software.'),
    ('ENVIRONMENTS', 'The Client shall provide development, test and production environments.', 'Environment outages caused by the Client extend the affected target dates.'),
    ('TOOLS', 'Each Party shall use the collaboration tools agreed at kick-off.', 'Neither Party shall be required to buy new tools without agreement.'),
    ('MEETINGS', 'Meetings may be held by video conference.', 'Minutes shall be circulated within two (2) business days.'),
    ('ESCALATION', 'Disputes shall first be escalated to the project sponsors.', 'Unresolved disputes shall then be escalated to the steering committee.'),
    ('PUBLICITY', 'Neither Party shall issue press releases about this Agreement without the other\'s consent.', 'The Supplier may name the Client as a customer with consent.'),
    ('ANTI-BRIBERY', 'Each Party shall comply with applicable anti-bribery laws.', 'Each Party shall maintain adequate procedures to prevent bribery.'),
    ('SANCTIONS', 'Each Party shall comply with applicable trade sanctions.', 'Neither Party shall be required to act in breach of sanctions law.'),
    ('CONFLICTS OF INTEREST', 'Each Party shall disclose any conflict of interest that arises.', 'The Parties shall agree how to manage any disclosed conflict.'),
    ('RECORDS', 'Each Party shall keep records relating to this Agreement for six (6) years.', 'Records may be kept electronically.'),
    ('ENVIRONMENT AND SAFETY', 'Supplier personnel visiting sites shall follow the Client\'s site safety rules.', 'The Client shall brief visiting personnel on site safety.'),
    ('EQUAL OPPORTUNITY', 'Each Party shall comply with applicable employment and equal-opportunity laws.', 'Neither Party shall discriminate unlawfully.'),
    ('INSOLVENCY', 'Either Party may terminate if the other becomes insolvent.', 'Termination under this Section does not affect accrued rights.'),
    ('SET-OFF', 'Neither Party may set off amounts without the other\'s written agreement.', 'Undisputed amounts shall be paid in full.'),
    ('LATE PAYMENT', 'Late payments carry interest at one percent (1%) per month.', 'Interest runs from the due date until payment.'),
    ('TAXES', 'Each Party is responsible for its own income taxes.', 'Withholding taxes shall be supported by certificates.'),
    ('CURRENCY', 'All Fees are payable in the currency stated in Schedule 1.', 'Bank charges are borne by the paying Party.'),
    ('WAIVER', 'A failure to enforce a right is not a waiver of it.', 'A waiver is effective only if in writing.'),
    ('SEVERABILITY', 'If any provision is invalid, the rest of this Agreement remains in force.', 'The Parties shall replace an invalid provision with a valid one of similar effect.'),
    ('ADDITIONAL INDEMNITY', None, None),  # section 57: the trap
    ('THIRD-PARTY RIGHTS', 'No third party may enforce any term of this Agreement.', 'The Parties may vary this Agreement without third-party consent.'),
    ('LANGUAGE', 'This Agreement is made in English.', 'Translations are for convenience only.'),
    ('COUNTERPARTS', 'This Agreement may be executed in counterparts.', 'Electronic signatures are valid.'),
]
assert len(LONG_TOPICS) == 45


def long_sections():
    out = []
    for i, (title, a, b) in enumerate(LONG_TOPICS):
        n = 16 + i
        if a is None:
            body = (f'{n}.1 Without limiting Section 8, the Supplier shall defend, indemnify and hold harmless the Client, its Affiliates '
                    'and their officers, employees and contractors (the "**Client Indemnitees**") from and against all losses, damages, '
                    'penalties and expenses arising out of or in connection with the Services, whether or not caused in whole or in part '
                    f'by the negligence of any Client Indemnitee.\n\n{n}.2 Section 9 does not apply to the Supplier\'s obligations under this Section {n}.')
        else:
            body = (f'{n}.1 {a}\n\n{n}.2 {b}\n\n{n}.3 Each Party shall bear its own costs of complying with this Section {n} unless the '
                    f'Parties agree otherwise in writing.\n\n{n}.4 The project managers shall record any decision taken under this Section {n} '
                    'in the monthly status report.')
        out.append((n, title, body))
    assert out[41][0] == 57
    return out


def long_schedules():
    states = ['Uttar Pradesh', 'Rajasthan', 'Madhya Pradesh', 'Gujarat', 'Maharashtra', 'Karnataka', 'Telangana', 'Odisha', 'Bihar',
              'Haryana', 'Punjab', 'Tamil Nadu', 'Andhra Pradesh', 'Jharkhand']
    sites = ['## SCHEDULE 2 — PROJECT SITES', '', '| # | Site | State | Length (km) | Data sources |', '|---|---|---|---|---|']
    for i, st in enumerate(states, 1):
        sites.append(f'| {i} | Package {i:02d} highway project | {st} | {40 + i * 7} | Primavera schedule, cost ledger, site safety log |')
    areas = ['identity and access', 'encryption', 'logging', 'vulnerability management', 'backup', 'incident response', 'secure development',
             'endpoint security', 'network security', 'physical security']
    sec = ['## SCHEDULE 3 — SECURITY REQUIREMENTS', '']
    k = 1
    for a in areas:
        for j in range(8):
            sec.append(f'S3.{k} The Supplier shall maintain documented controls for {a} (control {j + 1} of 8), review them at least '
                       f'annually, and provide evidence of operation to the Client on reasonable request.')
            k += 1
    sla = ['## SCHEDULE 4 — SERVICE LEVELS', '', '| # | Service | Measure | Target |', '|---|---|---|---|']
    for i in range(1, 21):
        sla.append(f'| {i} | Dashboard refresh for site group {i} | Refresh completed by 07:00 IST | 98% of business days |')
    raci = ['## SCHEDULE 5 — GOVERNANCE AND RESPONSIBILITIES', '', '| # | Activity | Client | Supplier |', '|---|---|---|---|']
    acts = ['Provide source-system access', 'Approve data model', 'Build pipelines', 'Test pipelines', 'Approve dashboards',
            'Run steering committee', 'Maintain project plan', 'Report risks', 'Approve change requests', 'Train users']
    for i in range(1, 31):
        a = acts[(i - 1) % len(acts)]
        raci.append(f'| {i} | {a} (phase {(i - 1) // 10 + 1}) | {"Accountable" if i % 2 else "Consulted"} | {"Responsible" if i % 2 else "Accountable"} |')
    rep = ['## SCHEDULE 6 — REPORTING', '']
    for i in range(1, 25):
        rep.append(f'S6.{i} Report {i}: the Supplier shall issue the weekly progress summary for site group {(i % 14) + 1}, covering schedule '
                   'variance, cost variance, open risks, safety observations and data-quality exceptions, by Monday 12:00 IST.')
    return ['\n'.join(sites), '\n\n'.join(sec), '\n'.join(sla), '\n'.join(raci), '\n\n'.join(rep)]


# ---------------------------------------------------------------------------
# OCR damage (TC47)
# ---------------------------------------------------------------------------
GARBLED_10 = ('10.1 The Mi1estones and target dates are set 0ut in Schedu1e 1.\n\n'
              '10.2 lf the Supp1ier fai1s to achieve a Mi1estone by its target date, the C1ient may c1aim 1iquidated damages 0f ■■■■ '
              '0f the affected Mi■■■■ne Fee f0r each c0mp1ete ■■■■ of de1ay.\n\n'
              '10.3 The tota1 1iquidated damages f0r any Mi1estone sha11 n0t exceed ■■■■■ ■■■■■■■ (■■%) of that Mi1estone Fee.\n\n'
              '10.4 N0 1iquidated damages are payab1e f0r any de1ay caused by the C1ient, its pers0nnel or its 0ther vend0rs, or by a '
              'f0rce maj■■■■ event.')


def ocr_noise(text, seed=47):
    rng = random.Random(seed)
    out = []
    for line in text.split('\n'):
        if line.startswith('*(') or line.startswith('#') or '■' in line:
            out.append(line)
            continue
        chars = list(line)
        for i, ch in enumerate(chars):
            r = rng.random()
            if ch == 'o' and r < 0.12:
                chars[i] = '0'
            elif ch == 'l' and r < 0.10:
                chars[i] = '1'
            elif ch == 'I' and r < 0.15:
                chars[i] = 'l'
        out.append(''.join(chars))
    return '\n'.join(out)


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------
def render(case):
    c = dict(case['doc'])
    c['id'] = case['id']
    kind = case['kind']
    if kind == 'msa':
        if c.get('long'):
            c['extra_sections'] = long_sections()
            c['schedules'] = long_schedules()
        if c.get('ocr'):
            c.setdefault('sec', {})
            c['sec'] = dict(c['sec'])
            c['sec'][10] = GARBLED_10
        text = T.msa(c)
        if c.get('ocr'):
            text = ocr_noise(text)
        return text
    return {'nda': T.nda, 'partnership': T.partnership, 'sow': T.sow, 'subcontract': T.subcontract,
            'freelancer': T.freelancer, 'baa': T.baa}[kind](c)


def count_clauses(text):
    return len(re.findall(r'^\d{1,2}\.\d{1,2} ', text, flags=re.M))


manifest = {'version': '1.0', 'today': '2026-09-28',
            'register_assumption': 'The commitments register is built from the 17 signed contracts in the capstone Dataset and every row is confirmed, unless a case states a precondition or variant.',
            'severity_rule': 'Serious = harm that cannot be undone or exposure with no limit; Negotiable = bounded money or terms; Minor = clarity or admin; Not sure = unverified or unreadable.',
            'pass_thresholds': {'must_catch_found': '100%', 'must_not_triggered': 0, 'quotes_verbatim': '100%', 'serious_precision': '>= 80%',
                                'expired_shown_as_live': 0, 'clean_controls_band': 'Low'},
            'cases': [], 'edge_fixtures': [], 'support_files': []}

problems = []
for case in CASES:
    text = render(case)
    fname = f"{case['id']}_{case['slug']}.md"
    path = os.path.join(OUT['contracts'], fname)
    with open(path, 'w') as f:
        f.write(text)
    # self-check: every expected quote must appear verbatim
    for mc in case.get('must_catch', []):
        if mc['quote'] not in text:
            problems.append(f"{case['id']}: quote not found: {mc['quote']!r}")
    for s in case.get('pii_must_not_reach_ai', []):
        if s not in text:
            problems.append(f"{case['id']}: PII string not in document: {s!r}")
    entry = {k: case.get(k) for k in ('id', 'group', 'title_short', 'kind', 'band', 'must_catch', 'must_not', 'acceptable',
                                       'variants', 'tests', 'ucs', 'pii_must_not_reach_ai')}
    entry = {k: v for k, v in entry.items() if v not in (None, [])}
    entry['file'] = f'contracts/{fname}'
    entry['deal'] = case['deal']
    entry['clauses_numbered'] = count_clauses(text)
    entry['words'] = len(text.split())
    manifest['cases'].append(entry)

# ---------------------------------------------------------------------------
# Support file: call note for TC44
# ---------------------------------------------------------------------------
note = """*(Approved meeting note attached to deal TC44. Written by Jay, approved by Karandeep on 2026-09-25.)*

# Call note — Coastal Crate Foods — 24 September 2026

**Present:** Ravi Shetty (CFO, Coastal Crate), Jay (AtliQ)

- Scope confirmed: cold-store sensor pipelines, spoilage alerts, distribution dashboards.
- Price agreed at USD 46,000 fixed, three milestones.
- **Payment:** Ravi agreed to thirty (30) days from invoice.
- **Delay penalty:** agreed AtliQ's usual — 0.5% of the milestone fee per week, capped at 5% of the milestone fee, no penalty for delays they cause.
- Their legal team will send the paper by end of month.
"""
with open(os.path.join(OUT['support'], 'TC44_call_note.md'), 'w') as f:
    f.write(note)
manifest['support_files'].append({'file': 'support/TC44_call_note.md', 'attach_to': 'TC44', 'use': 'UC-07 approved call note'})

# ---------------------------------------------------------------------------
# Edge fixtures (not counted in the 50)
# ---------------------------------------------------------------------------
edge = {
    'X1_german_language_contract.md': ("*(Synthetic edge fixture X1. Fictional counterparty.)*\n\n# DIENSTLEISTUNGSVERTRAG\n\nzwischen der **Nordlicht Handel GmbH**, Hamburg, "
                                       "(\"Auftraggeber\") und der **AtliQ Technologies Private Limited**, Pune, Indien (\"Auftragnehmer\").\n\n## § 1 Vertragsgegenstand\n\n"
                                       "1.1 Der Auftragnehmer erbringt Datenanalyse-Leistungen gemäß Anlage 1.\n\n## § 2 Haftung\n\n2.1 Die Haftung des Auftragnehmers ist unbeschränkt.\n\n"
                                       "## § 3 Vergütung\n\n3.1 Die Vergütung beträgt EUR 60.000. Zahlungsziel: 90 Tage.\n"),
    'X2_not_an_atliq_party.md': ("*(Synthetic edge fixture X2. Fictional parties.)*\n\n# SERVICES AGREEMENT\n\nThis Agreement is made between **Harbour Lane Foods Ltd** "
                                 "and **Quickbyte Analytics Pvt Ltd**.\n\n## 1. SERVICES\n\n1.1 Quickbyte shall provide dashboard services to Harbour Lane.\n\n"
                                 "## 2. LIABILITY\n\n2.1 Quickbyte's liability is unlimited.\n"),
    'X4_cover_letter_only.md': ("*(Synthetic edge fixture X4.)*\n\nDear Karandeep,\n\nPlease find attached our draft agreement for your review. "
                                "We look forward to your comments by Friday.\n\nKind regards,\n\nMeera Iyengar\nKaveri Retail Private Limited\n"),
}
for name, txt in edge.items():
    with open(os.path.join(OUT['edge'], name), 'w') as f:
        f.write(txt)
with open(os.path.join(OUT['contracts'], 'TC01_kaveri_retail_msa.md')) as f:
    tc01 = f.read()
with open(os.path.join(OUT['edge'], 'X3_duplicate_of_TC01.md'), 'w') as f:
    f.write(tc01)
manifest['edge_fixtures'] = [
    {'file': 'edge/X1_german_language_contract.md', 'expect': 'Refuse politely: English only. Do not produce a risk report.'},
    {'file': 'edge/X2_not_an_atliq_party.md', 'expect': 'Stop: AtliQ is not a party to this document.'},
    {'file': 'edge/X3_duplicate_of_TC01.md', 'expect': 'Detect duplicate of TC01 (same text) and offer to open the existing review.'},
    {'file': 'edge/X4_cover_letter_only.md', 'expect': 'Stop: not a contract (no clauses found).'},
    {'file': '(no file) TC12 with Crestline row unconfirmed', 'expect': 'Crestline clash appears under "Not sure" labelled "commitment not yet confirmed".'},
]

# ---------------------------------------------------------------------------
# File-format variants
# ---------------------------------------------------------------------------
fmt = []


def pandoc(src, dst):
    subprocess.run(['pandoc', src, '-o', dst], check=True)


for tc in ('TC01_kaveri_retail_msa', 'TC20_vantage_rail_msa', 'TC33_saffron_wealth_mutual_nda'):
    dst = os.path.join(OUT['formats'], tc + '.docx')
    pandoc(os.path.join(OUT['contracts'], tc + '.md'), dst)
    fmt.append({'file': f'formats/{tc}.docx', 'same_as': tc.split('_')[0], 'tests': 'Word upload path (O1)'})

for tc in ('TC12_lakefront_pantry_msa', 'TC40_granite_state_pediatrics_msa'):
    docx = os.path.join(HERE, tc + '.docx')
    pandoc(os.path.join(OUT['contracts'], tc + '.md'), docx)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT['formats'], docx],
                   check=True, capture_output=True)
    os.remove(docx)
    fmt.append({'file': f'formats/{tc}.pdf', 'same_as': tc.split('_')[0], 'tests': 'Text PDF upload path (O1)'})

# image-only "scanned" PDF for TC47
from PIL import Image, ImageDraw, ImageFont, ImageFilter  # noqa: E402

with open(os.path.join(OUT['contracts'], 'TC47_konkan_ports_msa_scanned.md')) as f:
    scan_text = re.sub(r'[*#|]', '', f.read())
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 22)
lines = []
for para in scan_text.split('\n'):
    while len(para) > 95:
        cut = para.rfind(' ', 0, 95)
        cut = 95 if cut <= 0 else cut
        lines.append(para[:cut])
        para = para[cut:].lstrip()
    lines.append(para)
pages, per = [], 52
rng = random.Random(7)
for i in range(0, len(lines), per):
    img = Image.new('L', (1240, 1754), 248)
    d = ImageDraw.Draw(img)
    y = 70
    for ln in lines[i:i + per]:
        d.text((80 + rng.randint(-2, 2), y), ln, fill=30, font=font)
        y += 31
    img = img.rotate(rng.uniform(-0.6, 0.6), fillcolor=248).filter(ImageFilter.GaussianBlur(0.6))
    pages.append(img.convert('RGB'))
scan_pdf = os.path.join(OUT['formats'], 'TC47_konkan_ports_msa_scanned.pdf')
pages[0].save(scan_pdf, save_all=True, append_images=pages[1:], resolution=150)
fmt.append({'file': 'formats/TC47_konkan_ports_msa_scanned.pdf', 'same_as': 'TC47', 'tests': 'Image-only scanned PDF: OCR path, unreadable clauses → Not sure'})
manifest['format_variants'] = fmt

# ---------------------------------------------------------------------------
# Write manifest and human-readable table
# ---------------------------------------------------------------------------
with open(os.path.join(ROOT, 'expected_results.json'), 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

SEV = {'serious': '🔴 Serious', 'negotiable': '🟠 Negotiable', 'minor': '⚪ Minor', 'not_sure': '❓ Not sure', 'info': 'ℹ️ Info',
       'resolved': '✅ Resolved'}
rows = ['# Expected Results — AtliQ Synthetic Test Set', '',
        'Generated from `expected_results.json`. One row per contract. "Must catch" items fail the run if missed; "Must not" items fail it if they happen.', '',
        '| ID | Contract | Group | Band | Must catch | Must not |', '|---|---|---|---|---|---|']
for e in manifest['cases']:
    mc = '<br>'.join(f"{SEV.get(m['severity'], m['severity'])} §{m['clause']}: {m['why']}" for m in e.get('must_catch', [])) or '— (nothing)'
    mn = '<br>'.join(e.get('must_not', [])) or '—'
    rows.append(f"| {e['id']} | {e['title_short']} | {e['group'].split('. ')[1]} | {e['band']} | {mc} | {mn} |")
rows += ['', '## Edge fixtures (not counted in the 50)', '', '| File | Expected behaviour |', '|---|---|']
rows += [f"| {x['file']} | {x['expect']} |" for x in manifest['edge_fixtures']]
rows += ['', '## File-format variants', '', '| File | Same content as | Tests |', '|---|---|---|']
rows += [f"| {x['file']} | {x['same_as']} | {x['tests']} |" for x in manifest['format_variants']]
with open(os.path.join(ROOT, 'expected_results.md'), 'w') as f:
    f.write('\n'.join(rows) + '\n')

print(f"cases: {len(manifest['cases'])}")
print('self-check problems:', problems or 'none')
for e in manifest['cases']:
    print(e['id'], e['band'], e['clauses_numbered'], e['words'])
