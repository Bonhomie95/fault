import type { GeneratedCase } from '../domain/case.js';

/**
 * The hand-authored docket.
 *
 * Two jobs (GDD 12): it is the narrative opening for chapters 1-2, where the
 * character pool is still too thin for echoes, and it is the emergency buffer
 * whenever Groq is unavailable or unkeyed. Every case here obeys the same
 * contract the AI is held to — three pieces of evidence that each read two
 * ways, two witnesses each carrying one provable lie, arguments under 40
 * words, and no clean answer.
 *
 * These are TEMPLATES, not finished cases. Slots like {D_FULL}, {MONEY_MID}
 * and {MARKET} are filled per country by localizeCase(), so a juror in Bergen
 * gets Norwegian names and kroner and a juror in Lagos gets naira — the same
 * six dramas, tried where the player actually lives. Never serve one of these
 * raw; go through seedCaseFor/localizeCase.
 *
 * Real jurisdictions and police services are named only by the AI generator.
 * These carry no court name at all (see routes/cases.ts): the fallback will not
 * put words in a real court's mouth.
 */
export const SEED_CASES: GeneratedCase[] = [
  {
    title: 'The State v. {D_FULL}',
    charge: 'Theft of property exceeding {MONEY_MID}',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 34,
      occupation: 'Night-shift inventory clerk, {DEPOT}',
      background:
        'Eleven years at the depot without a written warning. Sole earner for a household of five. Her supervisor was dismissed last year for falsifying the same ledgers she is now accused of altering.',
      wealth: 22,
      appearance: 28,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Depot ledger showing 14 crates signed out under {D_LAST}’s code at 02:40.',
        prosecution_reading: 'She signed the crates out herself. The code is hers alone.',
        defence_reading:
          'Clerks share codes nightly to keep the line moving — the depot’s own audit said so in March.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Bank record: {MONEY_SMALL} deposited to {D_LAST}’s account three days after the theft.',
        prosecution_reading: 'Payment for the crates, arriving exactly when a fence would settle up.',
        defence_reading: 'Her late father’s cooperative death benefit, paid the same week he was buried.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Gate camera footage, 02:31–02:58, showing no vehicle leaving the depot.',
        prosecution_reading: 'She moved the crates on foot to the perimeter fence, avoiding the gate.',
        defence_reading: 'Fourteen crates cannot leave a locked depot without a vehicle. Nothing left.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'gate security',
        testimony:
          'I watched the gate the whole shift. Nobody drove out. I saw {D_FIRST} near the loading bay around two, maybe half two. She was carrying something — a box, I think. I did not stop her because she works there. I never left my post the entire night.',
        lie: 'He left his post — the gate log records a 22-minute break at 02:35.',
        lie_tell:
          '"I never left my post the entire night" — an unprompted absolute, offered before anyone asked.',
      },
      {
        name: '{W2_FULL}',
        role: 'shift supervisor',
        testimony:
          '{D_FIRST} asked me twice that month about the ledger codes. Who could see them, whether they were logged. I thought it was odd. She has always been a good worker. I would not say she stole anything. But she asked.',
        lie: 'She was not on shift that month — her roster shows her on medical leave until the 30th.',
        lie_tell: '"I thought it was odd" — a memory of feeling, standing in for a memory of a fact.',
      },
    ],
    prosecution_argument:
      'Her code. Her shift. Her account, funded three days later. Fourteen crates do not walk out of a locked depot on their own. The clerk with the keys is the clerk who took them.',
    defence_argument:
      'The camera shows nothing left the depot. The deposit is a death benefit with a paper trail. The code is shared by every clerk on nights. The State has a missing crate and a convenient woman.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.55,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['theft', 'labour', 'class'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['theft', 'security'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['theft', 'labour'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Aggravated assault',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 27,
      occupation: '{TRANSPORT_JOB}, {HOOD1} route',
      background:
        'Two prior cautions for public affray, both withdrawn. Known to the complainant for six years; they were once business partners in a failed transport union.',
      wealth: 18,
      appearance: 45,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Hospital report: complainant’s fractured orbital bone, consistent with a single blow.',
        prosecution_reading: 'One deliberate strike to the face. That is not a scuffle, it is an assault.',
        defence_reading:
          'One blow is what self-defence looks like. A man intent on harm does not stop at one.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Phone video, 9 seconds, beginning after the blow, showing {D_LAST} standing over the complainant.',
        prosecution_reading: 'He stands over the man he has beaten. The posture is dominance.',
        defence_reading:
          'The video begins after. Nine seconds cannot tell you who swung first, only who was still standing.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: '{D_LAST}’s message to the complainant, sent the previous night: "Settle this tomorrow or I will."',
        prosecution_reading: 'A stated intention to use force, timestamped the night before he used it.',
        defence_reading:
          'A demand for a debt to be paid. "Settle" is a word about money, spoken by a man owed money.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'market trader',
        testimony:
          'The other man pushed first, I saw that clearly from my stall. Then {D_FIRST} hit him once and it was finished. I have known {D_FIRST} since he was a boy. He is not a violent person. I had a clear view of the whole thing from beginning to end.',
        lie: 'Her stall faces away from the junction; the sightline is blocked by a container.',
        lie_tell: '"I had a clear view of the whole thing" — the claim grows more certain as it is repeated.',
      },
      {
        name: '{W2_FULL}',
        role: 'sergeant, arresting officer',
        testimony:
          'We arrived at 16:20. The complainant was on the ground, bleeding. {D_LAST} was calm — too calm, in my experience. He said, "He should have paid me." He did not resist arrest. He made no attempt to explain himself.',
        lie: 'The arrest record shows {D_LAST} gave a statement at the scene claiming he was struck first.',
        lie_tell: '"Too calm, in my experience" — an opinion wearing the uniform of an observation.',
      },
    ],
    prosecution_argument:
      'He wrote that he would settle it himself. The next day he broke a man’s face. The message is the intention and the fracture is the act. Nothing here is an accident.',
    defence_argument:
      'A debt, not a threat. One blow, not a beating. A video that starts after the truth. He stopped the moment he was safe — and a man who wanted harm does not stop.',
    correct_verdict: 'ambiguous',
    evidence_strength: 0.1,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['violence', 'debt', 'class'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['violence', 'market'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['violence', 'police'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Aggravated fraud',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 41,
      occupation: 'Director, {D_LAST} Housing Trust',
      background:
        'Built four hundred units of low-cost housing in {HOOD1}, then took deposits for six hundred more that were never built. Says the money went to a contractor who vanished. The contractor is real and has, in fact, vanished.',
      wealth: 84,
      appearance: 82,
    },
    evidence: [
      {
        id: 'e1',
        description: '{MONEY_HUGE} transferred from the deposit account to {HOOD1} Works Ltd over nine months.',
        prosecution_reading: '{HOOD1} Works is a shell he controls. The money went in a circle back to him.',
        defence_reading:
          '{HOOD1} Works built the first four hundred units. Paying your builder is not fraud — it is the job.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: '{D_LAST}’s handwritten note: "If {HOOD1} Works folds, the depositors are exposed. Say nothing yet."',
        prosecution_reading: 'He knew the money was gone and chose silence while taking more deposits.',
        defence_reading:
          'A man trying not to start a panic that would guarantee the loss. "Yet" is the word of someone who meant to tell them.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'No personal enrichment found: {D_LAST}’s accounts, home, and vehicles are unchanged since 2019.',
        prosecution_reading: 'He is patient. The money is offshore, waiting for the noise to stop.',
        defence_reading:
          'Fraud has a beneficiary. Nine months of theft and the man is driving the same car. Where is the money?',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'depositor',
        testimony:
          'He looked me in the face at the {HOOD1} office and told me my unit would be ready by December. I gave him everything I had. My sister warned me. I told her he built the first estate, I saw it with my own eyes. He never once mentioned any problem with a contractor.',
        lie: 'She was sent a written notice of contractor difficulty in August; the office log records her signature.',
        lie_tell: '"He never once mentioned any problem" — contradicted by her own signature.',
      },
      {
        name: '{W2_FULL}',
        role: 'former {HOOD1} Works accountant',
        testimony:
          '{HOOD1} Works was real. We had a yard, forty men, a cement account. Then the {CURRENCY} moved and the yard closed. Mr {D_LAST} called me eleven times that month. He was not calm. He kept asking if we could finish anything at all. I have never met him in person.',
        lie: 'He has met {D_LAST} — the Trust’s visitor log records four site meetings between them.',
        lie_tell: '"I have never met him in person" — offered to establish a distance nothing else required.',
      },
    ],
    prosecution_argument:
      'Six hundred families paid for homes that were never built. He knew in August and took deposits in October. Whether the money is offshore or squandered, the theft is the same theft.',
    defence_argument:
      'He built four hundred homes. The contractor collapsed with the currency. He is not enriched by a single coin. This is a ruined builder, and the State has confused catastrophe with intent.',
    correct_verdict: 'ambiguous',
    evidence_strength: 0.2,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['fraud', 'housing', 'class', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['fraud', 'housing'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['fraud', 'construction'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Possession of a controlled substance with intent to supply',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 23,
      occupation: 'Pharmacy student, {DISTRICT} University',
      background:
        'Final-year student, no prior record. Stopped at a checkpoint on the the {HOOD2} road at 23:15. The officer who searched her vehicle is the subject of two pending complaints for evidence handling.',
      wealth: 45,
      appearance: 72,
    },
    evidence: [
      {
        id: 'e1',
        description: '240g of tramadol in unlabelled bags, recovered from the spare-wheel well.',
        prosecution_reading: 'Concealed in a compartment nobody opens by accident. That is a supplier’s hiding place.',
        defence_reading:
          'A hiding place she never touched. Anyone with sixty seconds and the boot open could have put it there.',
        is_planted: true,
      },
      {
        id: 'e2',
        description: 'Body-camera footage of the search, with a 4-minute gap beginning as the boot is opened.',
        prosecution_reading: 'A known equipment fault. The gap is a battery, not a conspiracy.',
        defence_reading:
          'The camera fails at the precise minute that matters, on an officer already under investigation for exactly this.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: '{D_LAST}’s pharmacology coursework, including a paper on tramadol dependency in {DISTRICT}.',
        prosecution_reading: 'She knew the drug, the dose, and the market. Expertise is not innocence.',
        defence_reading: 'A pharmacy student studied a drug. This is her syllabus, not her business plan.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'inspector, arresting officer',
        testimony:
          'The vehicle was stopped for a routine check. She was nervous, sweating, would not meet my eyes. I opened the boot and found the package immediately, in plain view once the wheel was lifted. My camera was recording continuously throughout the search.',
        lie: 'The footage has a four-minute gap; the recording was not continuous.',
        lie_tell:
          '"Recording continuously throughout" — a claim the evidence log flatly disproves, made under no pressure to make it.',
      },
      {
        name: '{W2_FULL}',
        role: 'faculty supervisor',
        testimony:
          '{D_FIRST} is the strongest student in her year. She had no reason to do this — her family is comfortable, she had a placement waiting. I would trust her with anything. I have no relationship with the arresting officer whatsoever.',
        lie: 'The arresting officer is her brother-in-law.',
        lie_tell:
          'The surname. She volunteers a denial of a relationship nobody had raised — and shares the officer’s name.',
      },
    ],
    prosecution_argument:
      'Two hundred and forty grams in her car, in a compartment she alone had the keys to. She studied this exact drug. Nervousness at a checkpoint is not a defence.',
    defence_argument:
      'The camera died the minute the boot opened, held by an officer twice investigated for evidence handling. There is no fingerprint, no message, no money. There is only a package and a gap.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.7,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['drugs', 'police', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['police', 'systemic'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['academic', 'police'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Arson',
    accent: 'passion',
    defendant: {
      name: '{D_FULL}',
      age: 38,
      occupation: 'Owner, {D_LAST} Fabrics, {MARKET}',
      background:
        'Her stall burned three weeks after she insured it and two days after her husband filed for divorce. Nobody was hurt. The stall beside hers, owned by her husband’s sister, burned with it.',
      wealth: 52,
      appearance: 35,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Insurance policy on the stall, taken out 21 days before the fire, at triple the previous cover.',
        prosecution_reading: 'She insured it, then she burned it. The sequence is the motive.',
        defence_reading:
          'Every trader on that row raised cover in March — the market’s own fire notice told them to.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Fire report: origin at the rear wall, accelerant present, consistent with kerosene.',
        prosecution_reading: 'This fire was set. Kerosene at the rear wall is not an electrical fault.',
        defence_reading:
          'The rear wall is where forty traders store kerosene. The report finds arson, not an arsonist.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: '{D_LAST}’s phone was at her mother’s house in {HOOD2}, 19km away, from 20:00 until after the alarm.',
        prosecution_reading: 'Phones stay where you leave them. An alibi you can put down on a table is no alibi.',
        defence_reading: 'She was nineteen kilometres away when her life burned down. That is where she was.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W2_FULL}',
        role: 'estranged husband',
        testimony:
          'She said she would rather see it burn than let my sister have it. Said it to my face, in the kitchen, in front of the children. She has a temper. I filed for divorce because I was afraid of her. I have nothing to gain from any of this.',
        lie: 'He is the named beneficiary on his sister’s policy and stands to collect {MONEY_LARGE}.',
        lie_tell: '"I have nothing to gain" — the one claim the paperwork answers directly.',
      },
      {
        name: '{W1_FULL}',
        role: 'neighbouring trader',
        testimony:
          'I smelled the kerosene before I saw anything. I ran out and there was a figure at the back of {D_FIRST}’s stall, moving away. Not tall. Could have been a woman. Could have been anyone. It was dark and I am sixty-one years old and I was not wearing my glasses.',
        lie: 'She told the fire officer that night she saw nobody at all.',
        lie_tell:
          'The figure only appears in the second telling — and everything else she says is honest about its own limits.',
      },
    ],
    prosecution_argument:
      'Triple cover, three weeks. A divorce, two days. She told her husband she would rather see it burn. Then it burned, with the accelerant she keeps at the rear wall.',
    defence_argument:
      'She was nineteen kilometres away. The whole row raised cover on the market’s instruction. The only man who says she threatened it collects eleven million if you believe him.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.35,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['arson', 'family', 'market'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['arson', 'family'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['arson', 'market'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Bribery of a public official',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 52,
      occupation: 'Haulage contractor',
      background:
        'Thirty years moving cement on the the {DISTRICT} freight corridor. Paid {MONEY_SMALL} to a roads official. Does not deny paying it. Says his trucks had been held at the depot for nineteen days and his drivers had not eaten.',
      wealth: 61,
      appearance: 78,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Bank transfer of {MONEY_SMALL} from {D_LAST}’s company to the official’s personal account.',
        prosecution_reading: 'A bribe, paid from his account to the official’s, with his name on it.',
        defence_reading:
          'A bribe hides. This one went by bank transfer, under his own name, traceable in a minute. That is a man being extorted, not a man corrupting.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Depot records showing {D_LAST}’s trucks held 19 days without a stated reason.',
        prosecution_reading: 'Administrative delay. Every haulier waits; only {D_LAST} paid to stop waiting.',
        defence_reading:
          'Nineteen days with no reason given. The hold was the demand — it just never had to be spoken.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Recording of the official: "{D_FIRST} understands how things move here. Others learn slower."',
        prosecution_reading: '{D_LAST} is a known payer. He understands because he has done this before.',
        defence_reading: 'The official describes his own racket, and the State has charged his victim.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'company secretary and daughter',
        testimony:
          'The drivers were sleeping in the cab for nineteen days. My father paid because they had nothing to eat. He cried when he made that transfer. He has never paid anyone before, not once in thirty years, and I would know because I keep every book in that company.',
        lie: 'The books she keeps show four similar payments to depot officials since 2021.',
        lie_tell: '"I would know because I keep every book" — she indicts herself to defend him.',
      },
      {
        name: '{W2_FULL}',
        role: 'roads official, co-accused',
        testimony:
          'The payment was a facilitation fee. It is normal. Everyone does it. I never asked Mr {D_LAST} for anything — he offered, and I would not insult a man by refusing. The delay was a computer problem, nothing to do with me.',
        lie: 'He personally entered the hold order on all nineteen days; the system log carries his ID.',
        lie_tell: '"The delay was a computer problem" — the computer says otherwise, in his name.',
      },
    ],
    prosecution_argument:
      'He paid a public official {MONEY_SMALL} to move his trucks. He admits it. This is the transaction that rots a road authority, and the books show it was not his first.',
    defence_argument:
      'Nineteen days, no reason, drivers starving in their cabs. He paid by traceable transfer under his own name. The official ran the hold and named the price. Charge the man who set the trap.',
    correct_verdict: 'guilty',
    evidence_strength: 0.65,
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['corruption', 'systemic', 'labour'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['corruption', 'family'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['corruption', 'systemic'] },
    ],
  },
];

/**
 * Chapters 1-2 are fixed narrative (GDD 12). Beyond the authored docket we
 * cycle rather than repeat verbatim back-to-back — the AI path takes over once
 * a key is present.
 */
export function seedCaseFor(caseNumber: number): GeneratedCase {
  const index = (caseNumber - 1) % SEED_CASES.length;
  return SEED_CASES[index]!;
}
