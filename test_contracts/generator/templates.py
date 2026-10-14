"""Document templates for the AtliQ synthetic test contracts.

Every template starts from AtliQ's usual positions (the "clean baseline") so that
each test contract can plant exactly one problem by overriding one section.
Nothing in a generated document says what was planted: the answers live only in
expected_results.json.
"""

PVT = ('**ATLIQ TECHNOLOGIES PRIVATE LIMITED**, a company incorporated under the Companies Act, 2013 '
       '(CIN U72900MH2019PTC321456), having its registered office at 4th Floor, Baner Business Bay, '
       'Pune 411045, Maharashtra, India')
INC = ('**ATLIQ INC.**, a Delaware corporation with its office at 101 College Road East, Suite 210, '
       'Princeton, New Jersey 08540, USA')

LAW_INDIA = ('14.1 This Agreement shall be governed by the laws of India.\n\n'
             '14.2 Any dispute not resolved amicably within thirty (30) days shall be referred to arbitration by a sole '
             'arbitrator appointed under the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration '
             'shall be Pune, Maharashtra, and the proceedings shall be conducted in English.')


def law_us(state, county):
    return (f'14.1 This Agreement shall be governed by the laws of the State of {state}, without regard to its '
            f'conflict-of-laws rules.\n\n'
            f'14.2 The Parties submit to the exclusive jurisdiction of the state and federal courts located in '
            f'{county}, {state}.')


def money(v, cur='USD'):
    return f'{cur} {v:,.0f}'


def milestones(value, cur='USD', names=None, weeks=(6, 12, 18)):
    names = names or ['Discovery and data assessment', 'Build and integration', 'Go-live and handover']
    split = [0.3, 0.4, 0.3]
    rows = ['| # | Milestone | Target date | Milestone Fee |', '|---|---|---|---|']
    for i, (n, w, s) in enumerate(zip(names, weeks, split), 1):
        rows.append(f'| M{i} | {n} | Start + {w} weeks | {money(value * s, cur)} |')
    rows.append(f'| | **Total Fees** | | **{money(value, cur)}** |')
    return '\n'.join(rows)


def rate_card(rates, cur='USD'):
    sr, de, bi = rates
    return ('| Role | Hourly rate |\n|---|---|\n'
            f'| Senior Data Engineer | {cur} {sr} |\n| Data Engineer | {cur} {de} |\n| BI Developer | {cur} {bi} |')


def header(c):
    return (f"*(Synthetic document {c['id']}. Fictional counterparty. "
            f"{c.get('provenance', 'Client draft received ' + c.get('received', '2026-09-29') + '; client paper, not yet marked up by AtliQ.')})*\n\n")


# ---------------------------------------------------------------------------
# Master services agreement
# ---------------------------------------------------------------------------

def msa_sections(c):
    cur = c.get('cur', 'USD')
    total = money(c['value'], cur)
    region = c.get('region', 'india')
    dp = {
        'india': ('11.1 Each Party shall comply with the Digital Personal Data Protection Act, 2023 and rules made under it.\n\n'
                  '11.2 The Supplier shall process personal data contained in Client data only to perform the Services and on the '
                  'documented instructions of the Client, shall implement reasonable security safeguards, and shall notify the Client '
                  'of any personal data breach without undue delay and in any event within seventy-two (72) hours.'),
        'us': ('11.1 Each Party shall comply with applicable United States federal and state privacy and data security laws.\n\n'
               '11.2 The Supplier shall use Client data only to perform the Services, shall maintain reasonable administrative, '
               'technical and physical safeguards, and shall notify the Client of any security incident affecting Client data '
               'within seventy-two (72) hours of becoming aware of it.'),
        'none': ('11.1 The Parties do not expect the Services to involve the processing of personal data. Client data made '
                 'available to the Supplier consists of operational, machine and commercial data.\n\n'
                 '11.2 If the Client intends to make personal data available, it shall notify the Supplier in advance and the '
                 'Parties shall agree appropriate data protection terms in writing before any such data is shared.'),
        'gcc': ('11.1 Each Party shall comply with the data protection laws applicable to it in the country where the Client '
                'operates.\n\n'
                '11.2 The Supplier shall process personal data contained in Client data only to perform the Services, shall keep '
                'it secure, and shall notify the Client of any personal data breach within seventy-two (72) hours.'),
    }[region]

    s = {}
    s[1] = ('DEFINITIONS', '\n\n'.join([
        '1.1 "**Affiliate**" means any entity that directly or indirectly controls, is controlled by, or is under common control '
        'with a Party, where "control" means ownership of more than fifty percent (50%) of the voting securities of an entity.',
        '1.2 "**Confidential Information**" means all non-public business, technical and commercial information disclosed by '
        'one Party to the other in connection with this Agreement.',
        '1.3 "**Deliverables**" means the work product created by the Supplier specifically for the Client under Schedule 1.',
        f'1.4 "**Fees**" means the fees set out in Schedule 1, totalling {total} unless varied by a written change request.',
        '1.5 "**Milestone**" and "**Milestone Fee**" have the meanings given in Schedule 1.',
        '1.6 "**Pre-existing Materials**" means tools, code libraries, frameworks, templates, methodologies and know-how owned by '
        'a Party before the Effective Date or developed independently of this Agreement.',
        '1.7 "**Services**" means the services described in Schedule 1.']))
    s[2] = ('SERVICES', '\n\n'.join([
        '2.1 The Supplier shall provide the Services and Deliverables described in Schedule 1.',
        '2.2 The Supplier may perform the Services from its delivery centre in Pune, India, and may use its Affiliates and '
        'subcontractors approved by the Client in writing, remaining responsible for their performance.',
        '2.3 The Client shall provide timely access to its systems, data, premises and personnel reasonably required for the Services.',
        '2.4 Changes to scope, timelines or Fees shall be agreed through a written change request signed by both Parties.']))
    s[3] = ('FEES AND PAYMENT', '\n\n'.join([
        f'3.1 The Client shall pay the Fees set out in Schedule 1. The total Fees for the Services are {total}.',
        '3.2 The Supplier shall invoice each Milestone Fee on completion of the relevant Milestone, and time-and-materials work '
        'monthly in arrears.',
        '3.3 The Client shall pay each undisputed invoice within thirty (30) days of receipt.',
        '3.4 Fees are exclusive of applicable taxes, which the Client shall pay in addition, save for taxes on the Supplier\'s net income.',
        '3.5 The Client shall notify any disputed amount in writing within ten (10) days of receipt of the invoice and shall pay '
        'the undisputed portion on time.']))
    s[4] = ('TERM AND TERMINATION', '\n\n'.join([
        '4.1 This Agreement starts on the Effective Date and continues until all Services under Schedule 1 are completed, '
        'unless terminated earlier under this Section 4.',
        '4.2 Either Party may terminate this Agreement if the other Party commits a material breach that is not cured within '
        'thirty (30) days of written notice.',
        '4.3 Either Party may terminate this Agreement for convenience on thirty (30) days\' written notice. On such termination '
        'the Client shall pay for all Services performed and work in progress up to the effective date of termination.',
        '4.4 Sections 5, 6, 8, 9 and 14 survive termination.']))
    s[5] = ('CONFIDENTIALITY', '\n\n'.join([
        '5.1 Each Party shall keep the other Party\'s Confidential Information confidential and use it only for the purposes of '
        'this Agreement.',
        '5.2 Section 5.1 does not apply to information that (a) is or becomes public other than through a breach of this '
        'Agreement; (b) was lawfully known to the receiving Party before disclosure; (c) is independently developed by the '
        'receiving Party; or (d) is lawfully received from a third party without restriction. A Party may disclose Confidential '
        'Information where required by law, after giving the other Party prompt notice where lawful.',
        '5.3 The obligations in this Section 5 survive for three (3) years after termination.']))
    s[6] = ('INTELLECTUAL PROPERTY', '\n\n'.join([
        '6.1 Upon payment in full of the relevant Milestone Fee, the Client shall own the Deliverables created specifically for '
        'the Client.',
        '6.2 The Supplier retains all rights in its Pre-existing Materials. To the extent any Pre-existing Materials are '
        'incorporated in the Deliverables, the Supplier grants the Client a non-exclusive, perpetual, royalty-free licence to use '
        'them as part of the Deliverables for the Client\'s internal business purposes.',
        '6.3 Each Party retains all rights in its own data.']))
    s[7] = ('WARRANTIES', '\n\n'.join([
        '7.1 The Supplier warrants that the Services will be performed with reasonable skill and care in accordance with good '
        'industry practice.',
        '7.2 The Supplier warrants that each Deliverable will conform in all material respects to Schedule 1 for sixty (60) days '
        'after acceptance. The Client\'s remedy for breach of this warranty is re-performance or correction by the Supplier.',
        '7.3 Each Party warrants that it has full power and authority to enter into this Agreement.',
        '7.4 Except as expressly set out in this Agreement, all other warranties are excluded to the extent permitted by law.']))
    s[8] = ('INDEMNITIES', '\n\n'.join([
        '8.1 Each Party shall indemnify the other against third-party claims to the extent arising from (a) its breach of '
        'Section 5; (b) infringement of a third party\'s intellectual property rights by materials it supplied; or (c) its gross '
        'negligence or wilful misconduct.',
        '8.2 Neither Party is required to indemnify the other for losses to the extent caused by the indemnified Party\'s own '
        'negligence, breach or wilful misconduct.',
        '8.3 The indemnified Party shall notify the indemnifying Party promptly of any claim, allow it to control the defence, '
        'and provide reasonable assistance at its cost.']))
    s[9] = ('LIMITATION OF LIABILITY', '\n\n'.join([
        '9.1 Neither Party shall be liable for any indirect, special or consequential loss, or for any loss of profit, revenue or '
        'goodwill.',
        '9.2 Each Party\'s aggregate liability arising out of or in connection with this Agreement shall not exceed the total '
        'Fees paid or payable under this Agreement.',
        '9.3 Sections 9.1 and 9.2 do not limit liability for fraud or wilful misconduct, or the Client\'s obligation to pay the Fees.']))
    s[10] = ('DELIVERY AND LIQUIDATED DAMAGES', '\n\n'.join([
        '10.1 The Milestones and target dates are set out in Schedule 1.',
        '10.2 If the Supplier fails to achieve a Milestone by its target date for reasons attributable to the Supplier, the Client '
        'may claim liquidated damages of one-half percent (0.5%) of the affected Milestone Fee for each complete week of delay.',
        '10.3 The total liquidated damages for any Milestone shall not exceed five percent (5%) of that Milestone Fee.',
        '10.4 No liquidated damages are payable for any delay caused by the Client, its personnel or its other vendors, or by a '
        'force majeure event, and the affected target dates shall be extended accordingly.',
        '10.5 Liquidated damages are the Client\'s sole and exclusive remedy for delay.']))
    s[11] = ('DATA PROTECTION', dp)
    s[12] = ('INSURANCE', '12.1 The Supplier shall maintain professional indemnity insurance with cover of not less than USD 1,000,000 '
                          'per claim for the duration of this Agreement and shall provide a certificate on request.')
    s[13] = ('NON-SOLICITATION', '13.1 During this Agreement and for twelve (12) months after it ends, neither Party shall directly '
                                 'solicit for employment any employee of the other Party who was directly involved in the Services. '
                                 'General advertisements not targeted at such employees are not a breach.')
    s[14] = ('GOVERNING LAW AND DISPUTES', c.get('law', LAW_INDIA if c.get('entity', 'pvt') == 'pvt' else law_us('New Jersey', 'Mercer County')))
    s[15] = ('GENERAL', '\n\n'.join([
        '15.1 This Agreement, with its Schedules, is the entire agreement between the Parties on its subject matter.',
        '15.2 No amendment is effective unless made in writing and signed by both Parties.',
        '15.3 Neither Party may assign this Agreement without the other\'s written consent, except to an Affiliate on written notice.',
        '15.4 Neither Party is liable for delay or failure caused by events beyond its reasonable control, including natural '
        'disasters, epidemics, war, government action and failures of public utilities ("force majeure").',
        '15.5 Notices shall be in writing and delivered by hand, courier or email to the addresses set out above.',
        '15.6 This Agreement may be signed electronically and in counterparts.',
        '15.7 If there is a conflict between the main body of this Agreement and a Schedule, the main body prevails.',
        '15.8 The Parties are independent contractors.']))

    for n, val in c.get('sec', {}).items():
        title = s[n][0] if isinstance(val, str) else val[0]
        body = val if isinstance(val, str) else val[1]
        s[n] = (title, body)
    for n, extra in c.get('append', {}).items():
        s[n] = (s[n][0], s[n][1] + '\n\n' + extra)
    for n, title, body in c.get('extra_sections', []):
        s[n] = (title, body)
    return s


def parties_block(c):
    sup = c.get('supplier_block') or (PVT if c.get('entity', 'pvt') == 'pvt' else INC)
    return (f"This {c.get('doc_name', 'Master Services Agreement')} (the \"**Agreement**\") is made on {c.get('eff', '1 October 2026')} "
            f"(the \"**Effective Date**\")\n\n**BETWEEN**\n\n**{c['client']}**, {c['client_desc']} (the \"**Client**\"); and\n\n"
            f"{sup} (the \"**Supplier**\").\n\nThe Client and the Supplier are each a \"**Party**\".\n")


def signatures(c):
    sup_name = 'ATLIQ TECHNOLOGIES PRIVATE LIMITED' if c.get('entity', 'pvt') == 'pvt' else 'ATLIQ INC.'
    if c.get('supplier_sign'):
        sup_name = c['supplier_sign']
    title = 'Chief Executive Officer' if c.get('entity', 'pvt') == 'pvt' else 'President'
    return (f"\n## SIGNATURES\n\n**For and on behalf of {c['client'].upper()}**\n\nName: {c['client_signatory']}\n\n"
            f"Signature: ____________________  Date: __________\n\n**For and on behalf of {sup_name}**\n\n"
            f"Name: Karandeep, {title}\n\nSignature: ____________________  Date: __________\n")


def schedule1(c):
    cur = c.get('cur', 'USD')
    out = ['## SCHEDULE 1 — STATEMENT OF WORK AND FEES', '',
           f"**S1.1 Background.** {c['background']}", '',
           '**S1.2 Services.**', '']
    out += [f'- {x}' for x in c['services']]
    out += ['', f"**S1.3 Delivery.** {c.get('delivery', 'The Services will be delivered remotely by the Supplier team in Pune, India, with on-site workshops as agreed.')}", '']
    if c.get('rates'):
        out += ['**S1.4 Rate card (time and materials).**', '', rate_card(c['rates'], cur), '',
                f"Estimated effort is capped at {money(c['value'], cur)} unless increased by a written change request. "
                + c.get('rate_note', 'Rates are fixed for the first twelve (12) months.'), '']
    else:
        out += ['**S1.4 Milestones and Fees (fixed price).**', '', milestones(c['value'], cur, c.get('milestone_names')), '']
    if c.get('s1_extra'):
        out += [c['s1_extra'], '']
    return '\n'.join(out)


def msa(c):
    s = msa_sections(c)
    body = [header(c), f"# {c.get('title', 'MASTER SERVICES AGREEMENT')}", '', parties_block(c), '']
    for n in sorted(s):
        title, text = s[n]
        body += [f'## {n}. {title}', '', text, '']
    body.append(schedule1(c))
    for sched in c.get('schedules', []):
        body += [sched, '']
    body.append(signatures(c))
    return '\n'.join(body)


# ---------------------------------------------------------------------------
# NDA
# ---------------------------------------------------------------------------

def nda(c):
    sup = PVT
    mutual = c.get('mutual_body', True)
    if mutual:
        obligations = ('2.1 Each Party (as "**Recipient**") shall keep the Confidential Information of the other Party (as "**Discloser**") '
                       'confidential, use it only for the Purpose, and disclose it only to its employees and advisers who need to know it '
                       'and are bound by equivalent obligations.\n\n'
                       '2.2 Each Recipient shall protect the Discloser\'s Confidential Information with at least the care it uses for its '
                       'own confidential information, and no less than reasonable care.')
        defs = ('1.1 "**Confidential Information**" means non-public information disclosed by either Party to the other in connection '
                'with the Purpose, in any form.\n\n1.2 "**Purpose**" means ' + c['purpose'] + '.')
    else:
        obligations = c['oneway_obligations']
        defs = c['oneway_defs']
    exceptions = c.get('exceptions', '3.1 Section 2 does not apply to information that (a) is or becomes public other than through a breach '
                   'of this Agreement; (b) was lawfully known to the Recipient before disclosure; (c) is independently developed by the '
                   'Recipient without use of the Confidential Information; or (d) is lawfully received from a third party without '
                   'restriction.\n\n3.2 A Recipient may disclose Confidential Information where required by law or a regulator, after '
                   'giving the Discloser prompt notice where lawful.')
    term = c.get('term', '4.1 This Agreement lasts for two (2) years from the Effective Date. The obligations in Section 2 survive for '
                 'three (3) years after it ends.\n\n4.2 On request, the Recipient shall return or destroy the Discloser\'s Confidential '
                 'Information, save for copies kept in routine backups or required by law.')
    parts = [header(c), f"# {c.get('title', 'MUTUAL NON-DISCLOSURE AGREEMENT')}", '',
             f"This Agreement is made on {c.get('eff', '1 October 2026')} (the \"**Effective Date**\") between **{c['client']}**, "
             f"{c['client_desc']} (\"**{c.get('client_short', 'the Company')}**\"), and {sup} (\"**AtliQ**\").", '',
             '## 1. DEFINITIONS', '', defs, '', '## 2. OBLIGATIONS', '', obligations, '',
             '## 3. EXCEPTIONS', '', exceptions, '', '## 4. TERM', '', term, '']
    n = 5
    for title, text in c.get('extra', []):
        parts += [f'## {n}. {title}', '', text.replace('{n}', str(n)), '']
        n += 1
    parts += [f'## {n}. GENERAL', '',
              f'{n}.1 No licence or other right is granted except as expressly stated. Nothing in this Agreement obliges either Party to '
              f'enter into any further agreement.\n\n{n}.2 This Agreement is governed by the laws of India, and the courts at Pune have '
              f'exclusive jurisdiction.\n\n{n}.3 This Agreement may be signed electronically and in counterparts.', '']
    parts.append(signatures({**c, 'entity': 'pvt'}))
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# Partnership agreement (AtliQ as partner of a platform company)
# ---------------------------------------------------------------------------

def partnership(c):
    parts = [header(c), '# IMPLEMENTATION AND REFERRAL PARTNER AGREEMENT', '',
             f"This Agreement is made on {c.get('eff', '1 October 2026')} between **{c['client']}**, {c['client_desc']} "
             f"(\"**{c['vendor_short']}**\"), and {PVT} (the \"**Partner**\").", '',
             '## 1. DEFINITIONS', '',
             f"1.1 \"**Platform**\" means {c['platform']}.\n\n1.2 \"**Territory**\" means {c['territory']}.\n\n"
             '1.3 "**Referral Fee**" means the fee payable under Section 4.', '',
             '## 2. APPOINTMENT', '',
             f"2.1 {c['vendor_short']} appoints the Partner as a non-exclusive implementation and referral partner for the Platform in the "
             f"Territory, and the Partner accepts the appointment.\n\n2.2 {c.get('scope_note', 'The Partner shall promote the Platform to prospective customers in the Territory and deliver implementation services to customers who subscribe to it.')}", '',
             '## 3. PARTNER OBLIGATIONS', '',
             '3.1 The Partner shall maintain at least three (3) engineers certified on the Platform.\n\n'
             '3.2 The Partner shall register each prospect in the partner portal within five (5) business days of first substantive contact.\n\n'
             '3.3 The Partner shall not make representations about the Platform beyond its published documentation.', '',
             '## 4. REFERRAL FEES', '',
             f"4.1 {c['vendor_short']} shall pay the Partner a Referral Fee of fifteen percent (15%) of first-year subscription fees received "
             'from customers referred by the Partner, within forty-five (45) days of the end of each quarter.', '',
             '## 5. CONFIDENTIALITY', '',
             '5.1 Each Party shall keep the other\'s confidential information confidential and use it only for this Agreement, subject to '
             'the usual exceptions for public, already-known, independently developed or lawfully received information. These '
             'obligations survive for three (3) years after termination.', '',
             '## 6. TERM AND TERMINATION', '',
             '6.1 This Agreement lasts for three (3) years from its date.\n\n6.2 Either Party may terminate it on ninety (90) days\' written '
             'notice, or immediately for an uncured material breach after thirty (30) days\' notice.', '',
             '## 7. LIABILITY', '',
             '7.1 Neither Party is liable for indirect or consequential loss. Each Party\'s aggregate liability is limited to the Referral '
             'Fees paid or payable in the twelve (12) months before the claim.', '',
             '## 8. GOVERNING LAW', '',
             '8.1 This Agreement is governed by the laws of India. Disputes shall be resolved by arbitration seated in Mumbai.', '']
    for title, text in c.get('extra', []):
        parts += [f'## {title}', '', text, '']
    parts.append(signatures({**c, 'entity': 'pvt'}))
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# Statement of work under an existing agreement
# ---------------------------------------------------------------------------

def sow(c):
    cur = c.get('cur', 'USD')
    parts = [header(c), f"# {c['title']}", '',
             f"This Statement of Work (\"**SOW**\") is entered into under {c['parent']} (the \"**Agreement**\") between **{c['client']}** "
             f"(the \"**Client**\") and {PVT} (the \"**Supplier**\"). Capitalised terms not defined here have the meanings given in "
             'the Agreement. Except as stated in this SOW, all terms of the Agreement apply unchanged.', '',
             '## 1. BACKGROUND', '', c['background'], '',
             '## 2. SCOPE', '']
    parts += [f'- {x}' for x in c['services']]
    parts += ['', '## 3. MILESTONES AND FEES', '', milestones(c['value'], cur, c.get('milestone_names')), '',
              f"Fees are fixed. Invoicing and payment follow the Agreement ({c.get('payment_ref', 'thirty (30) days from invoice')}).", '',
              '## 4. DELIVERY', '', c.get('delivery', 'Delivered remotely by the Supplier team in Pune, India.'), '',
              '## 5. ASSUMPTIONS', '']
    parts += [f'- {x}' for x in c.get('assumptions', ['The Client provides read access to source systems within five (5) business days of the start date.',
                                                      'Any change in scope is handled through the change process in the Agreement.'])]
    parts += ['']
    parts.append(signatures({**c, 'entity': 'pvt'}))
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# AtliQ as buyer: agency subcontract
# ---------------------------------------------------------------------------

def subcontract(c):
    s = {
        1: ('ENGAGEMENT', f"1.1 AtliQ engages the Vendor to perform the services in the Engagement Schedule (the \"**Services**\") for "
                          f"AtliQ's client identified there (the \"**End Client**\").\n\n1.2 The Vendor shall perform the Services with "
                          'reasonable skill and care and in accordance with AtliQ\'s reasonable instructions.'),
        2: ('FEES AND PAYMENT', '2.1 AtliQ shall pay the fees in the Engagement Schedule.\n\n2.2 The Vendor shall invoice each deliverable '
                                'on acceptance. AtliQ shall pay each undisputed invoice within thirty (30) days of receipt.'),
        3: ('ACCEPTANCE AND DELAY', '3.1 AtliQ shall review each deliverable within ten (10) business days and either accept it or give '
                                   'reasons for rejection.\n\n3.2 If the Vendor misses a delivery date for reasons attributable to the '
                                   'Vendor, AtliQ may claim liquidated damages of one-half percent (0.5%) of the affected deliverable fee '
                                   'per week of delay, capped at five percent (5%) of that fee. No liquidated damages apply to delays '
                                   'caused by AtliQ, the End Client or force majeure.'),
        4: ('TERMINATION', '4.1 Either party may terminate for convenience on fifteen (15) days\' written notice. AtliQ shall pay for '
                           'work performed and work in progress up to the termination date.\n\n4.2 Either party may terminate for '
                           'an uncured material breach after fifteen (15) days\' notice.'),
        5: ('CONFIDENTIALITY', '5.1 The Vendor shall keep confidential all information of AtliQ and the End Client received in '
                               'connection with the Services, use it only to perform the Services, and impose equivalent obligations '
                               'on its personnel. These obligations survive for three (3) years after termination.'),
        6: ('INTELLECTUAL PROPERTY', '6.1 All intellectual property rights in the deliverables created for the Services vest in AtliQ on '
                                     'payment, so that AtliQ can transfer them to the End Client. The Vendor retains its pre-existing '
                                     'tools and grants AtliQ and the End Client a perpetual, royalty-free licence to use any that are '
                                     'incorporated in the deliverables.'),
        7: ('DATA PROTECTION', '7.1 The Vendor shall process personal data received in connection with the Services only on AtliQ\'s '
                               'documented instructions, keep it secure, not transfer it to any other person or location without '
                               'AtliQ\'s written consent, and delete it at the end of the Services.\n\n7.2 The Vendor shall comply with '
                               'any data protection obligations that AtliQ owes to the End Client and that AtliQ notifies to the Vendor, '
                               'and shall sign any data processing agreement AtliQ reasonably requires to meet those obligations.'),
        8: ('LIABILITY', '8.1 Neither party is liable for indirect or consequential loss.\n\n8.2 Each party\'s aggregate liability is limited '
                         'to the total fees payable under this Agreement, except for breach of Sections 5 and 7, fraud or wilful misconduct.'),
        9: ('GOVERNING LAW', '9.1 This Agreement is governed by the laws of India. Disputes shall be resolved by arbitration seated in Pune.'),
    }
    for n, val in c.get('sec', {}).items():
        s[n] = val if isinstance(val, tuple) else (s[n][0], val)
    for n in c.get('remove', []):
        s.pop(n, None)
    parts = [header(c), '# SUBCONTRACTING AGREEMENT', '',
             f"This Agreement is made on {c.get('eff', '5 October 2026')} between {PVT} (\"**AtliQ**\"), and **{c['client']}**, "
             f"{c['client_desc']} (the \"**Vendor**\").", '']
    for i, n in enumerate(sorted(s), 1):
        title, text = s[n]
        # renumber sub-clauses when sections are removed
        if i != n:
            text = text.replace(f'{n}.', f'{i}.')
        parts += [f'## {i}. {title}', '', text, '']
    parts += ['## ENGAGEMENT SCHEDULE', '', f"**End Client:** {c['end_client']}", '', f"**Services:** {c['services']}", '',
              c['fee_table'], '']
    parts.append(signatures({**c, 'entity': 'pvt'}))
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# Freelancer agreement
# ---------------------------------------------------------------------------

def freelancer(c):
    parts = [header(c), '# INDEPENDENT CONTRACTOR AGREEMENT', '',
             f"This Agreement is made on {c.get('eff', '5 October 2026')} between {PVT} (\"**AtliQ**\") and **{c['client']}**, "
             f"{c['client_desc']} (the \"**Contractor**\").", '',
             '## 1. SERVICES', '', f"1.1 The Contractor shall provide the services described in the Schedule (the \"**Services**\").\n\n"
             '1.2 The Contractor is an independent contractor and not an employee of AtliQ.', '',
             '## 2. FEES', '', '2.1 AtliQ shall pay the fees in the Schedule within thirty (30) days of receiving a valid monthly invoice.', '',
             '## 3. CONFIDENTIALITY', '', '3.1 The Contractor shall keep confidential all information of AtliQ and its clients received in '
             'connection with the Services, and use it only to perform the Services.', '',
             '## 4. INTELLECTUAL PROPERTY', '', c['ip'], '',
             '## 5. TERM AND TERMINATION', '', '5.1 This Agreement runs until the end date in the Schedule. Either party may end it on '
             'fourteen (14) days\' written notice; AtliQ shall pay for Services performed up to the end date.', '',
             '## 6. GOVERNING LAW', '', '6.1 This Agreement is governed by the laws of India, and the courts at Pune have exclusive jurisdiction.', '',
             '## SCHEDULE', '', c['schedule'], '']
    parts.append(signatures({**c, 'entity': 'pvt'}))
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# HIPAA business associate agreement
# ---------------------------------------------------------------------------

def baa(c):
    parts = [header(c), '# BUSINESS ASSOCIATE AGREEMENT', '',
             f"This Business Associate Agreement (\"**BAA**\") is made between **{c['client']}**, {c['client_desc']} "
             f"(\"**Covered Entity**\"), and {INC} (\"**Business Associate**\"), and supplements the Master Services Agreement "
             'between them (the "**MSA**").', '',
             '## 1. DEFINITIONS', '',
             '1.1 Terms used but not defined in this BAA have the meanings given in the HIPAA Rules (45 C.F.R. Parts 160 and 164).\n\n'
             '1.2 "**PHI**" means protected health information created, received, maintained or transmitted by Business Associate on '
             'behalf of Covered Entity.\n\n'
             '1.3 "**Subcontractor**" means any person or entity, including any Affiliate of Business Associate, to whom Business '
             'Associate delegates a function, activity or service involving PHI.', '',
             '## 2. PERMITTED USES', '', '2.1 Business Associate may use and disclose PHI only to perform the services under the MSA and '
             'as required by law.', '',
             '## 3. SAFEGUARDS AND REPORTING', '', '3.1 Business Associate shall implement the safeguards required by the HIPAA Security '
             'Rule and report any breach of unsecured PHI within five (5) business days of discovery.', '',
             '## 4. LOCATION OF PHI; SUBCONTRACTORS', '', c['location'], '',
             '## 5. TERM AND TERMINATION', '', '5.1 This BAA lasts as long as the MSA. On termination Business Associate shall return or '
             'destroy all PHI.', '',
             '## 6. GOVERNING LAW', '', f"6.1 This BAA is governed by the laws of the State of {c['state']} and applicable federal law.", '']
    parts.append(signatures({**c, 'entity': 'inc'}))
    return '\n'.join(parts)
