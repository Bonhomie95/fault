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
 * dramas, tried where the player actually lives. Never serve one of these
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
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'Eleven years. Eleven years, and one ledger is supposed to tell you who I am?' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'Everyone on nights knows my code. Ask them how many times they used it.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Her code. Her shift. Her signature. At some point a coincidence becomes a pattern.' },
      { speaker: 'defendant', cue: 'e2', tone: 'ashamed', text: 'That money buried my father. You want the receipt for the coffin?' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'Fourteen crates, and not one vehicle left that gate. Where did they go — on foot?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'defiant', text: 'I watched that gate all night. Nothing gets past me. Nothing.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'tense', text: 'He watched the gate? He was asleep in the hut by two. Everyone knows it.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I run a clean floor. If a code is misused, it is the owner who answers for it.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Sympathy is not an alibi, and neither is a long service record.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Please. Whatever you decide, my children hear about it tonight.' },
    ],
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
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'He came at me first. Nobody filmed that part, did they?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'A fractured orbital bone. That is not a shove. That is a decision.' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'Nine seconds. They start the video after it is over and call it the whole story.' },
      { speaker: 'defendant', cue: 'e3', tone: 'ashamed', text: 'I say stupid things when I am owed money. Half this market does.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: '"Settle this" is how every debt in that market is spoken of. Every single one.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'I saw his fist. I know what I saw. I have no reason to lie for anyone.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'When I arrived he was standing over the man. He did not deny a thing.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'defiant', text: 'Did not deny? You never asked me anything. You put me on the ground.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'Ask yourself who started it. Then notice that nobody in this room can tell you.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'You have seen nine seconds of my life. Is that enough for you?' },
    ],
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
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'Not one coin reached my pocket. Check. They already did.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Nine months of transfers. You do not do that by accident.' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'Say nothing yet — because a panic would have sunk every depositor at once.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: '"Say nothing." Those are his words. Not ours.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'A thief who takes nothing. Ask the prosecution to explain that.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'I trusted him with everything I had. Everything. Look at me and tell me that was safe.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'ashamed', text: 'I know. I know what you lost. I was trying to stop it.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'defiant', text: 'I kept those books. I know exactly who signed what, and when.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'Bad judgment is not a crime. If it were, this court would be empty.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Would you rather I had let it all collapse and walked away clean?' },
    ],
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
        'Final-year student, no prior record. Stopped at a checkpoint on the {HOOD2} road at 23:15. The officer who searched her vehicle is the subject of two pending complaints for evidence handling.',
      wealth: 45,
      appearance: 72,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'tense', text: 'I study this drug. That is not the same as selling it.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Two hundred and forty grams, hidden under the spare wheel. That is not coursework.' },
      { speaker: 'defendant', cue: 'e2', tone: 'defiant', text: 'Four minutes. The camera goes dark for four minutes. Ask him why.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'The only four minutes nobody can account for are the four that matter.' },
      { speaker: 'defendant', cue: 'e3', tone: 'ashamed', text: 'I wrote that paper because my cousin died of it. Is that my motive now?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'Twenty years on the force. The bags were exactly where I said they were.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'startled', text: 'He knew where to look before he opened the boot. How?' },
      { speaker: 'witness2', cue: 'witness2', tone: 'tense', text: 'A brilliant student. But I cannot tell you what anyone does off campus.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'An expert in tramadol, found with tramadol. The defence calls that irony. I call it expertise.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'One word from you and my degree, my name, everything goes. Please be sure.' },
    ],
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
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
      'She was nineteen kilometres away. The whole row raised cover on the market’s instruction. The only man who says she threatened it collects {MONEY_LARGE} if you believe him.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.35,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'That stall was my whole life. Why would I burn my whole life?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Triple the cover, twenty-one days before the fire. Some would call that foresight.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'The market was robbed twice that month. Everyone raised their cover.' },
      { speaker: 'defendant', cue: 'e2', tone: 'startled', text: 'Kerosene? Every stall on that row keeps kerosene for the lamps.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'Nineteen kilometres away. Unless the prosecution thinks she flew.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'Her phone was nineteen kilometres away. Phones can be left behind.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'defiant', text: 'I know my wife. When she is cornered she does desperate things.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'tense', text: 'Ask him where he was that night. Go on. Ask him.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'tense', text: 'I smelled smoke and saw someone at the back. I could not see a face.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'I have lost the stall. Do not take the rest of me too.' },
    ],
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
        'Thirty years moving cement on the {DISTRICT} freight corridor. Paid {MONEY_SMALL} to a roads official. Does not deny paying it. Says his trucks had been held at the depot for nineteen days and his drivers had not eaten.',
      wealth: 61,
      appearance: 78,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
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
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'I have employed four hundred people in this district. Ask any of them about me.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'A consulting fee, invoiced and taxed. Since when is paperwork a crime?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'A consulting fee. Paid to his personal account. What exactly did he consult on?' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'Nineteen days my trucks sat there. Nineteen days of wages I still paid.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'The official talks about my client. My client says nothing at all on that tape.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'My father built that company honestly. I have seen every page of our books.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'defiant', text: 'I will not be the only one who pays for how this city works.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'startled', text: 'He is facing prison. He would say anything to take someone with him.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Trucks held. Money paid. Trucks released. You can count to three.' },
      { speaker: 'defendant', cue: 'late', tone: 'calm', text: 'If you convict me, who is going to pay those four hundred wages next month?' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['corruption', 'systemic', 'labour'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['corruption', 'family'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['corruption', 'systemic'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Failing to stop after a collision causing serious injury',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 46,
      occupation: 'Managing partner, {D_LAST} & Associates',
      background:
        'Twenty years building a practice from one rented desk in {HOOD1}. A cyclist was left with a broken pelvis on the {HOOD2} road at 23:20. Two days later his car was in a body shop. He says his driver had the keys that night.',
      wealth: 88,
      appearance: 74,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Toll camera: {D_LAST}’s car on the {HOOD2} road at 23:12, eight minutes before the collision. The driver is not visible through the glare.',
        prosecution_reading: 'His car, on that road, eight minutes before. Somebody was at that wheel, and it was his wheel.',
        defence_reading:
          'The camera shows a car, not a driver. Another man held the keys and has every reason to say he did not.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Body-shop booking for a headlamp and bumper, made from {D_LAST}’s own phone at 06:10 the next morning and paid in cash.',
        prosecution_reading: 'He booked it himself, at dawn, and paid in cash. Nobody rushes a scratch.',
        defence_reading:
          'He owns the car. Of course the booking came from his phone — the driver brought it back damaged and said nothing.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Phone location: {D_LAST}’s phone at his home in {HOOD1} from 21:00 until 07:00.',
        prosecution_reading: 'A phone on a nightstand is the easiest alibi a man can arrange.',
        defence_reading: 'His phone never left the house. The State is asking you to believe that he did.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'personal driver, six years in the household',
        testimony:
          'I dropped {D_FIRST} home at nine and parked in the compound, as always. The keys stay in a bowl by the front door. I went home by bus. I did not touch that car again until Monday. I have never once taken it out without permission.',
        lie: 'Two parking fines for that car were issued on his nights off, in districts the family never visits.',
        lie_tell:
          '"I have never once taken it out without permission" — an answer to a question nobody had asked yet.',
      },
      {
        name: '{W2_FULL}',
        role: 'next-door neighbour',
        testimony:
          'I heard his gate at about eleven and a car leave. I did not look out. It came back after midnight, fast, and the gate banged. I did not see who was driving. {D_FIRST} has always been a considerate neighbour. I have no quarrel with that family whatsoever.',
        lie: 'She is suing {D_LAST} over a boundary wall; the civil claim was filed in March.',
        lie_tell: '"No quarrel whatsoever" — a denial of a motive, volunteered before any motive was put to her.',
      },
    ],
    prosecution_argument:
      'His car on that road eight minutes before. His own phone booking the repair at dawn, paid in cash. A cyclist left on the tarmac while somebody drove home and shut the gate.',
    defence_argument:
      'The camera saw a car, not a face. His phone never left the house. The one man who admits holding the keys has a history of borrowing that car at night.',
    correct_verdict: 'guilty',
    evidence_strength: 0.55,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'I have driven that road for twenty years. I have never left anyone lying on it.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'His car. That road. Eight minutes before she was hit. Who else drives a man’s car at midnight?' },
      { speaker: 'defendant', cue: 'e1', tone: 'tense', text: 'Ask my driver. He knows exactly where those keys are kept. So does half my household.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'A windscreen full of glare. Not a face. Not a hand on the wheel. Nothing.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Ten past six in the morning, from his own phone, paid in cash. Nobody rushes a scratch.' },
      { speaker: 'defendant', cue: 'e2', tone: 'defiant', text: 'It is my car. Who else was going to book the repair?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'The keys were in the bowl by the door. Same as every night for six years.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'startled', text: 'Every night? Then where does my car go on your nights off?' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I heard the gate go, and I heard it come back fast. That is all I know.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'A toll photo, a garage bill and a neighbour. Is that proof, or is it a feeling?' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Somebody did this to her. Please do not let it be the easiest name in the room.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['driving', 'wealth', 'class'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['driving', 'labour'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['driving', 'neighbours'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Fraudulent claims against the public health fund totalling {MONEY_MID}',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 39,
      occupation: 'Pharmacist in charge, {D_LAST} Pharmacy, {HOOD1}',
      background:
        'Took over her mother’s pharmacy at twenty-six and kept it open through two floods. The claims went in under her licence number. The owner’s nephew, who ran the till and the claims software, left the country the week the audit began.',
      wealth: 58,
      appearance: 30,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Health fund audit: 412 claims for insulin and inhalers never recorded as dispensed, all filed under {D_LAST}’s licence number.',
        prosecution_reading: 'Her licence, her pharmacy, four hundred false claims. A licence number is a signature.',
        defence_reading:
          'Every one of the 412 was filed between 22:00 and 02:00. The shutters come down at eight, and she is home by nine.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Transfer of {MONEY_SMALL} from the pharmacy account to {D_LAST}’s personal account in April.',
        prosecution_reading: 'The fund’s money, moved from the business into her own pocket.',
        defence_reading: 'Her quarterly salary: the same figure, on the same date, every quarter for six years.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Claims-software log showing {D_LAST}’s password used on every night in question, and an audit photograph of that password on a note taped under the till.',
        prosecution_reading: 'Her password, night after night. If she taped it to the till, that was how she wanted it to look.',
        defence_reading: 'A password taped under a till belongs to every hand that ever worked that till.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'health fund auditor',
        testimony:
          'The pattern was obvious within a day. Night-time claims, high-value items, one licence. In my experience the licence holder always knows. I interviewed {D_FIRST} twice and her answers shifted. I reviewed every single one of those claims personally before referring it.',
        lie: 'The audit file shows a 40-claim sample was reviewed by hand; the rest were extrapolated by software.',
        lie_tell:
          '"Every single one … personally" — four hundred and twelve claims, and a certainty sized for forty.',
      },
      {
        name: '{W2_FULL}',
        role: 'former pharmacy cashier',
        testimony:
          'I worked that till three years. {D_FIRST} did the claims herself on Sunday mornings. The nephew mostly stocked shelves. I left because my hours were cut, nothing more. I have not spoken to the nephew since he went abroad.',
        lie: 'Her phone records show eleven calls to the nephew’s foreign number in the month after he left.',
        lie_tell: '"I have not spoken to the nephew" — distance from a man the defence had not yet mentioned.',
      },
    ],
    prosecution_argument:
      'Four hundred and twelve false claims under one licence and one password. A licence is a promise that you know what goes out under your name. Whoever typed them, she let it happen.',
    defence_argument:
      'Every claim was filed after midnight, when she was home. The password was taped under the till. The money was her salary. The man who ran that software fled the week the audit began.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.5,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'tense', text: 'I kept that pharmacy open through two floods. Now a spreadsheet says I am a thief.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Four hundred and twelve claims. One licence. Whose name do you think the fund was paying?' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'Every claim filed after ten at night. Ask what time the shutters come down.' },
      { speaker: 'defendant', cue: 'e2', tone: 'defiant', text: 'That is my salary. Same amount, same day, for six years. Pick any quarter you like.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'Taped under the till, she says. An interesting place to keep a secret.' },
      { speaker: 'defendant', cue: 'e3', tone: 'ashamed', text: 'Yes, it was taped there. Everyone did it. It was careless. Careless is not stealing.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'In twenty years of audits, the licence holder has always known. Always.' },
      { speaker: 'defence', cue: 'witness1', tone: 'calm', text: 'Always? Then why audit anything? Arrest whoever’s name is painted over the door.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'defiant', text: 'She did the claims herself on Sundays. I watched her do it.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'startled', text: 'Watched me? From where? You never once worked a Sunday.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'My mother built that counter. Whatever you decide, decide it about me, not a licence number.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['fraud', 'health', 'family'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['fraud', 'audit'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['fraud', 'labour'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Arson endangering life',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 58,
      occupation: 'Landlord, owner of eleven residential buildings',
      background:
        'Inherited three buildings and bought eight more. His tenants in {HOOD2} refused a rent rise and won a tribunal case against him in January. In March their building burned at 03:00. Everyone got out; two tenants were treated for smoke.',
      wealth: 94,
      appearance: 62,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Tribunal ruling, January: {D_LAST} ordered to repair the building or freeze rents for two years.',
        prosecution_reading: 'A building he could no longer profit from, on land worth {MONEY_HUGE} empty. Two months later it was empty.',
        defence_reading:
          'Landlords lose tribunals every week. If losing one were a motive for arson, every city would be alight.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Insurance claim for {MONEY_LARGE}, filed by {D_LAST} nine days after the fire, with a demolition permit application attached.',
        prosecution_reading: 'Nine days. The permit was ready before the smoke had cleared.',
        defence_reading: 'A gutted building must come down by law. His solicitor filed both together, as solicitors do.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Fire service report: fire started in the ground-floor bin store; smoke alarms on three floors had no batteries.',
        prosecution_reading: 'Someone who knew the building silenced it first, then lit it.',
        defence_reading:
          'The tribunal file records tenants complaining that faulty alarms shrieked all night. Tenants pull batteries from alarms like that.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'caretaker, employed by {D_LAST}',
        testimony:
          'I checked the bin store at eleven, like every night, and it was locked. Only {D_FIRST} and I have keys. I did the stairwells, the lights, the back door. Then I went home at half eleven. {D_FIRST} never once asked me to do anything wrong.',
        lie: 'His phone stayed connected to the building’s wifi until 02:41, twenty minutes before the fire.',
        lie_tell:
          '"Then I went home" — the only step of his night he gives without a single detail.',
      },
      {
        name: '{W2_FULL}',
        role: 'tenant, tenants’ association chair',
        testimony:
          'He told me on the stairs that the building would be empty by summer, one way or another. Those were his words. I have lived there fourteen years. I took him to the tribunal. I have never touched a smoke alarm in that building.',
        lie: 'Her own tribunal statement says she pulled the battery from her hallway alarm because it sounded every night.',
        lie_tell: '"I have never touched a smoke alarm" — a denial of the one thing nobody had put to her.',
      },
    ],
    prosecution_argument:
      'He lost the tribunal in January. By March the building was ash, the alarms were silent, and the claim and the demolition permit went in together. One man profited from that fire.',
    defence_argument:
      'A tenant who is suing him says he threatened her. Tenants silenced the alarms themselves. The caretaker had the key and was in the building. The State has a motive and no match.',
    correct_verdict: 'guilty',
    evidence_strength: 0.5,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'I have owned buildings for thirty years. Not one burned until this one.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'He could not raise the rent and could not sell with tenants in it. Then the building emptied itself.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'I lost a tribunal, so I appealed. That is what people do with lawyers instead of matches.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Nine days. The claim and the demolition permit, stapled together. Who prepares that fast?' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'The tenants themselves complained the alarms screamed all night. So who pulled those batteries?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'I locked that bin store at eleven. I have locked it every night for nine years.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'calm', text: 'Nine years he has worked for me. Ask him if I ever asked him for anything crooked.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'defiant', text: '"Empty by summer, one way or another." I will hear him say that until I die.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'tense', text: 'She took me to a tribunal and won. Now she wants to take the rest as well?' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'A motive is not a match. Somebody struck it. Do you know who?' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Two people breathed that smoke. I would not wish it on anyone who lives under my roofs.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['arson', 'housing', 'wealth', 'class'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['arson', 'labour'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['arson', 'housing'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Assault occasioning actual bodily harm while on duty',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 36,
      occupation: 'Police constable, {HOOD1} station',
      background:
        'Nine years on the beat, with a commendation for pulling passengers from a burning bus. Accused of beating a street vendor in the back of a patrol van. The vendor had filed a complaint against the whole station the month before.',
      wealth: 40,
      appearance: 85,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Custody photograph of the vendor at 18:40: bruised ribs and a split lip, forty minutes after arrest.',
        prosecution_reading: 'He went into the van unmarked and came out bruised. Only one officer rode in the back.',
        defence_reading:
          'He fought the arrest on a concrete pavement in front of forty people. The kerb could have done every mark.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Van system log: rear camera set to "maintenance" from 17:55 to 18:30, entered under {D_LAST}’s badge number.',
        prosecution_reading: 'He switched off the camera himself, five minutes before the ride.',
        defence_reading:
          'The terminal logs whatever badge number is typed into it. Anyone on that shift could have typed his.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Street video, 70 seconds, showing the vendor struggling on the pavement and {D_LAST} holding him down with a knee.',
        prosecution_reading: 'The temper on the pavement is the temper that carried on in the van.',
        defence_reading: 'Seventy seconds of the restraint he was trained to use. It shows control, not rage.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'fellow constable, drove the van',
        testimony:
          'I drove. The partition was shut and I heard nothing unusual — shouting, which is normal. {D_FIRST} is the best officer at our station. I have never seen him use more force than he needed. I only found out the camera was off the next day.',
        lie: 'The radio log records him telling control "rear camera down" at 17:57.',
        lie_tell: '"The next day" — the one moment in his account he dates, and the one the log contradicts.',
      },
      {
        name: '{W2_FULL}',
        role: 'street vendor, complainant',
        testimony:
          'On the pavement it was one knee, fine, I was shouting. In the van he said, "This is for your complaint," and hit me until we stopped. I have never been arrested before in my life. I only want the truth said out loud.',
        lie: 'He has two previous arrests for obstruction, both at the same market.',
        lie_tell: '"Never been arrested before in my life" — a biography, offered in the middle of describing a punch.',
      },
    ],
    prosecution_argument:
      'He went into the van unmarked and came out bruised. The camera went dark under this officer’s badge five minutes before the ride, and his partner knew. A uniform is not permission.',
    defence_argument:
      'Seventy seconds of lawful restraint on film, bruises the pavement explains, and a complainant who lied about his own record. A terminal anyone could type into. You are asked to convict on darkness.',
    correct_verdict: 'guilty',
    evidence_strength: 0.45,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'Nine years. I have carried people out of fires. Ask anyone in {HOOD1} who I am.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Unmarked on the pavement. Bruised at the station. Something happened in between, and he was there.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'He threw himself at the kerb. Forty people watched him do it.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'That terminal accepts any badge number you type. Ask how many others were typed that night.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Five minutes before the ride, the camera goes dark under his number. Nobody else’s.' },
      { speaker: 'defendant', cue: 'e3', tone: 'tense', text: 'One knee, seventy seconds, exactly as we are trained. Would you rather I let him run?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'I have ridden with him four years. I would ride with him tomorrow.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'pleading', text: 'He told me it was for my complaint. I heard him. Look at my face.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'defiant', text: 'He complained about the whole station. Now he has one of us in the dock. Think about why.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'You are being asked to convict a man for what a camera did not see.' },
      { speaker: 'defendant', cue: 'late', tone: 'tense', text: 'Whatever you decide, every officer at that station learns something from it. Think about what.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['violence', 'police', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['police', 'loyalty'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['violence', 'market', 'police'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Demanding money with menaces',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 44,
      occupation: 'Chair, traders’ welfare union, {MARKET}',
      background:
        'Elected three times by the traders. Collects a weekly levy that pays the cleaners and the night guards. A rival faction lost the last union election by forty votes and filed this complaint a week later.',
      wealth: 30,
      appearance: 22,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Envelope of {MONEY_SMALL} in marked notes, found in the unlocked drawer of {D_LAST}’s union desk.',
        prosecution_reading: 'The complainant’s marked notes, in his desk, the morning after she paid.',
        defence_reading:
          'The union office is open to forty traders all day. A drawer without a lock is a letterbox, not a hiding place.',
        is_planted: true,
      },
      {
        id: 'e2',
        description: 'Recording of a phone call: a man’s voice saying "Pay by Friday or the stall moves to the back row."',
        prosecution_reading: 'Pay or lose your pitch. A threat with a deadline.',
        defence_reading:
          'The voice analyst could not say whose voice it is. The levy is due on Fridays, and the union rulebook moves stalls that do not pay.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Union ledger: every weekly levy receipted, except the complainant’s, which is blank for six weeks.',
        prosecution_reading: 'Six weeks off the books — the weeks he was pocketing her money himself.',
        defence_reading: 'Six blank weeks because she refused to pay anything at all. That refusal is the whole dispute.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'trader, complainant',
        testimony:
          'He came to my stall with two young men and told me my pitch had a price. I paid because I was frightened. I went to the police that afternoon and they marked the notes. I have no connection to the other faction. I only want to trade in peace.',
        lie: 'She stood on the rival faction’s slate in the union election; the ballot list carries her name.',
        lie_tell: '"No connection to the other faction" — a claim about politics, volunteered in a story about fear.',
      },
      {
        name: '{W2_FULL}',
        role: 'market night guard',
        testimony:
          'I lock the union office at six and hand the key to {D_FIRST}. Nobody goes in after that. That night I checked the door at ten and again at two. I sat outside that office all night. Nobody came near it.',
        lie: 'His own guard sheet shows him signed in at the far gate from 21:00 until 04:00.',
        lie_tell: '"I sat outside that office all night" — contradicted by his own handwriting at another gate.',
      },
    ],
    prosecution_argument:
      'Marked notes in his desk. A threat with a Friday deadline. Six weeks of her money missing from his ledger. A man who decides who trades where holds exactly the power extortion needs.',
    defence_argument:
      'A drawer anyone can open, a voice nobody can name, a ledger showing she refused to pay. She ran against him and lost by forty votes. This is an election, being refought in a courtroom.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.45,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'The traders chose me three times. Ask yourself who did not like the result.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Marked notes, in his drawer, the morning after she paid. What more would you need him holding?' },
      { speaker: 'defendant', cue: 'e1', tone: 'startled', text: 'That drawer has no lock. Forty people pass through that office before noon.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'Levy due Friday. Unpaid stalls move back. That is the union rulebook, read in an angry voice.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: '"Pay by Friday or the stall moves." Whoever says those words, they are a threat.' },
      { speaker: 'defendant', cue: 'e3', tone: 'tense', text: 'Six weeks she has not paid. The cleaners still sweep up her rubbish.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'I paid because I was afraid. Do you know what it is to be afraid at your own stall?' },
      { speaker: 'defendant', cue: 'witness1', tone: 'defiant', text: 'Ask her whose name was printed beside hers on that ballot paper.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I lock that office myself. Nobody gets past me after six.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'He won three elections. Ask who needed him gone before the fourth.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'If I go, who collects for the night guards on Friday? Nobody. Think about who wants that.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['extortion', 'market', 'politics'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['extortion', 'market', 'politics'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['market', 'security'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Offering inducements to voters',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 55,
      occupation: 'Councillor, standing for re-election in {HOOD1}',
      background:
        'Ran a food bank out of her own garage for eleven years before she ever stood for office. Eleven days before polling, her volunteers handed out groceries worth {MONEY_SMALL} in {HOOD1}, in bags the colour of her campaign posters.',
      wealth: 75,
      appearance: 50,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Grocery bags in the candidate’s campaign colour, handed out at two sites in {HOOD1} eleven days before polling.',
        prosecution_reading: 'Food, in her colours, eleven days before the vote. The message did not need words.',
        defence_reading:
          'The food bank has used that colour since long before her campaign existed. The campaign copied the bags, not the other way round.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Food bank sign-up sheet asking each recipient for name, address and "Will you be voting?"',
        prosecution_reading: 'A list of fed voters, and a check on who would turn out. That is a bribe’s receipt.',
        defence_reading:
          'The same question has been on every sheet for years, for a registration drive the council itself funds.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Campaign finance return listing the groceries as a declared campaign expense.',
        prosecution_reading: 'Her own return calls it campaign spending. She knew exactly what it was for.',
        defence_reading:
          'Nobody declares a bribe to the electoral commission. Her accountant listed it because the bags carried her colour.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'food bank volunteer',
        testimony:
          'We were told to smile, hand over the bag and say the councillor sent her regards. Nobody said vote for her, not in those words. I have volunteered five years. I never saw anyone from the campaign office at the distribution.',
        lie: 'Photographs of the {HOOD1} distribution show her standing beside the campaign manager.',
        lie_tell: '"I never saw anyone from the campaign office" — an absence nobody had asked her to account for.',
      },
      {
        name: '{W2_FULL}',
        role: 'election observer',
        testimony:
          'People told me they had been fed by her and meant to repay her. That is what those parcels were for. I counted over four hundred bags. I have no personal stake in the result. I was there only to observe.',
        lie: 'He is on the rival candidate’s campaign payroll; the rival’s finance return lists his fee.',
        lie_tell: '"No personal stake in the result" — a disclaimer delivered before his account had even begun.',
      },
    ],
    prosecution_argument:
      'Food in her colours, eleven days out. A sheet asking who would vote. Her own return calling it campaign spending. Charity does not need a logo, and it does not need to know your ballot.',
    defence_argument:
      'She fed that street for eleven years before anyone voted for her. Bribes are hidden; this was declared. The man who counted the bags is paid by her opponent.',
    correct_verdict: 'ambiguous',
    evidence_strength: 0.15,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'I fed that street for eleven years before I asked it for a single vote.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Eleven days before the vote, in her colours, on every doorstep. Timing is a message.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'Should the food bank have shut for the election? Would the hungry have preferred that?' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: '"Will you be voting?" Tell me why a food bank needs to know that.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'The council paid for that question. Their money, their form, their words.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'Name one bribe ever declared to the electoral commission. One.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'We smiled and passed on her regards. Nobody told anyone how to vote.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'Four hundred bags. I counted every one. People know when they are being thanked in advance.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'defiant', text: 'Ask him who pays his wages. Ask him in front of this jury.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Charity does not need a logo. And it does not need to know how you vote.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Whatever you decide, somebody on that street will be hungry on Saturday.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['politics', 'corruption', 'charity', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['charity', 'politics'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['politics', 'corruption'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Gross negligence causing death',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 47,
      occupation: 'Doctor in charge, {HOOD2} community clinic',
      background:
        'The only doctor on a night shift at a clinic built for three. A patient with chest pain waited four hours and died before she was seen. {D_LAST} had written to the health board six times about night staffing; the letters are in the file.',
      wealth: 64,
      appearance: 77,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Triage record: patient classed "urgent — see within 30 minutes" at 23:10; first seen by a doctor at 03:05.',
        prosecution_reading: 'Urgent means thirty minutes. She waited four hours on his shift.',
        defence_reading:
          'For two of those hours he was working on a motorcyclist from a road crash. Urgent is not the highest category — the motorcyclist was.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Six letters from {D_LAST} to the health board; the last, nine days before, reads: "Someone will die on a night like this."',
        prosecution_reading: 'He knew the danger exactly, wrote it down, and still left her waiting.',
        defence_reading: 'He predicted this death in writing and was ignored. The negligence is sitting in the board’s inbox.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Phone record: {D_LAST}’s personal phone in a call for 41 minutes, 00:50 to 01:31. The number called is withheld.',
        prosecution_reading: 'Forty-one minutes on his own phone while an urgent patient deteriorated.',
        defence_reading:
          'The motorcyclist was transferred to the regional hospital that night. Somebody spent a long time on a phone finding him a bed.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'night nurse',
        testimony:
          'I told him twice she was getting worse. He said, "Keep her on the monitor, I am coming." He was with the motorcyclist, that is true. He was on his phone a long time. I recorded her observations every fifteen minutes, all night.',
        lie: 'Her chart shows no observations recorded between 00:30 and 02:15.',
        lie_tell: '"Every fifteen minutes, all night" — a routine described in exactly the place it was not kept.',
      },
      {
        name: '{W2_FULL}',
        role: 'health board operations manager',
        testimony:
          'The clinic was staffed to the approved level. Staffing concerns go through a proper channel and we answer every one. I do not recall receiving any letter from {D_FIRST} about patient safety. We take every warning seriously.',
        lie: 'The board’s registry logs all six letters as received, the last one stamped by her own office.',
        lie_tell: '"I do not recall receiving" — a failure of memory precise enough to fit around six letters.',
      },
    ],
    prosecution_argument:
      'Urgent means thirty minutes, and she waited four hours. He wrote that someone would die on a night like this. He knew what that waiting room meant, and spent forty minutes on his phone.',
    defence_argument:
      'One doctor, a clinic built for three, a crash victim bleeding in the next room. He warned the board six times and they say they never saw it. You are asked to convict the only person who stayed.',
    correct_verdict: 'ambiguous',
    evidence_strength: -0.1,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'tense', text: 'I was the only doctor in that building. Do you know what that means at midnight?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Thirty minutes is what urgent means. Four hours is what she got.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'A man was bleeding on the next table. Tell me which one you would have walked away from.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: '"Someone will die on a night like this." He wrote that nine days earlier. Who read it?' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'He knew exactly how dangerous that night was. Knowing raises the duty. It does not lower it.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'Forty-one minutes on his own phone. Ask what her chart says about those minutes.' },
      { speaker: 'defendant', cue: 'e3', tone: 'tense', text: 'Someone had to find that man a bed. The phone does not dial itself.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'I told him she was getting worse. Twice. I will carry that night for the rest of my life.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'The clinic was staffed to the approved level. That is a matter of record.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'defiant', text: 'Approved by whom? Ask her how many nights she has spent inside that building.' },
      { speaker: 'defendant', cue: 'late', tone: 'ashamed', text: 'I think about her every night. I think about the man on the next table too.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['negligence', 'health', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['health', 'labour'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['health', 'systemic', 'bureaucracy'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Computer fraud and theft of {MONEY_LARGE} from members’ savings',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 29,
      occupation: 'IT support technician, {HOOD1} savings cooperative',
      background:
        'Self-taught, hired off a night course, the first in his family with a salaried job. Sixty-three members of the cooperative, most of them retired, lost their savings over one weekend. He had admin access and was the last to leave on Friday.',
      wealth: 35,
      appearance: 70,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Server log: an admin session from the back-office desk at 18:52 on Friday created the transfer rules that emptied the accounts.',
        prosecution_reading: 'His access, his desk, his hour. He wrote the rules and went home.',
        defence_reading: 'Three people held admin passwords. The log records a desk, not a person sitting at it.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Crypto exchange account that received the money, opened three weeks earlier with a selfie and a scan of {D_LAST}’s identity card.',
        prosecution_reading: 'His face, his card, his account — waiting three weeks for the money to arrive.',
        defence_reading:
          'His identity card was scanned for the cooperative’s staff file, which sits in an unlocked cabinet. Faces are forged every day.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'A new motorbike bought by {D_LAST} for cash, ten days after the theft.',
        prosecution_reading: 'A technician’s wage, and a new motorbike for cash ten days later.',
        defence_reading: 'He says he saved for it for two years in a savings circle. The circle’s book exists and can be read.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'cooperative branch manager',
        testimony:
          'I left at five on Friday. {D_FIRST} was the only one still in the back office. The week before, he asked me how the transfer limits worked. I have never shared my admin password with anyone. I trusted that boy like a son.',
        lie: 'An IT ticket from May shows he read his password out to the whole support team during an outage.',
        lie_tell:
          '"Never shared my admin password with anyone" — an absolute, offered about the one thing that would make him a suspect.',
      },
      {
        name: '{W2_FULL}',
        role: 'friend, keeper of a savings circle',
        testimony:
          '{D_FIRST} paid into our circle every month for two years. When his turn came he took the pot, and that is what bought the motorbike. I keep the book myself. He never missed a single payment.',
        lie: 'The book she keeps shows four missed payments, and his turn to collect fell in March, before the theft.',
        lie_tell: '"Never missed a single payment" — the book in her own handwriting disagrees.',
      },
    ],
    prosecution_argument:
      'His desk, his hour, his face on the account that caught the money. A motorbike for cash ten days later. Sixty-three pensioners woke on Monday with nothing. The technician had the keys.',
    defence_argument:
      'Three people held admin passwords, and the manager read his aloud in May. His ID card sat in an unlocked cabinet. A young man buying a motorbike is not a hacker.',
    correct_verdict: 'guilty',
    evidence_strength: 0.6,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'tense', text: 'I fix printers and reset passwords. Now I am supposed to be some kind of genius?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'His desk. His hour. Nobody else in the building. The rules were written from his chair.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'The log names a desk. Three people had the password to that desk.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'His face. His card. An account opened three weeks before the money came to fill it.' },
      { speaker: 'defendant', cue: 'e2', tone: 'defiant', text: 'Every office I have ever worked in photocopied my ID card. Every single one.' },
      { speaker: 'defendant', cue: 'e3', tone: 'ashamed', text: 'Two years I waited for that bike. My mother cried when I rode it home.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'I trusted him like a son. I gave him every chance a young man could want.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'startled', text: 'Like a son? Then tell them who you gave your password to in May.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'He paid into our circle. I keep the book. I know what he paid.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Sixty-three pensioners. One weekend. Ask who in that building could have done it.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'I am the first in my family with a salary. Please be sure before you make me the last.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['fraud', 'technology', 'class'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['fraud', 'banking'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['savings', 'friendship'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Child abduction in breach of a custody order',
    accent: 'passion',
    defendant: {
      name: '{D_FULL}',
      age: 33,
      occupation: 'Hairdresser, {HOOD2}',
      background:
        'Took her seven-year-old son to her mother’s village for nineteen days during her ex-husband’s custody weeks. The boy was found well and attending the village school. She says she never received the order that gave his father those weeks.',
      wealth: 25,
      appearance: 38,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Custody order of 4 May granting the father alternate weeks; a process server’s affidavit says it was left at {D_LAST}’s salon.',
        prosecution_reading: 'Served at her own place of work. Not reading an order you were handed is not a defence.',
        defence_reading: 'Left at a salon with six chairs and four stylists. The affidavit does not say who took it.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Text from {D_LAST} to her sister: "If they take him from me I will go where nobody can find us."',
        prosecution_reading: 'She announced the plan in writing, then carried it out.',
        defence_reading:
          'Sent in March, weeks before any order existed. And she went to her own mother’s house — the first place anyone would look.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Enrolment form at the village school, signed by {D_LAST}, giving her mother’s address and her own phone number.',
        prosecution_reading: 'She enrolled him. That is not a visit to grandmother. That is a new life.',
        defence_reading: 'Her real name, her real address, her own number. People who are hiding do not fill in forms.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'the boy’s father, ex-husband',
        testimony:
          'She knew about the order. I told her myself, on the phone, the day it was made. She said she would never let him come to me. I have never raised my voice to her or to the boy. I only want my son home.',
        lie: 'Phone records show no call between them on 4 May or in the fortnight after.',
        lie_tell: '"I told her myself, on the phone" — the one detail in his account that a phone bill can check.',
      },
      {
        name: '{W2_FULL}',
        role: 'process server',
        testimony:
          'I handed the order to the salon owner at 11:15. She was cutting a man’s hair; I remember her clearly. Fifteen years I have served papers and never lost one. I always get a signature. Always.',
        lie: 'The affidavit carries no signature — only his note, "left with staff".',
        lie_tell: '"I always get a signature" — said about a document that has none.',
      },
    ],
    prosecution_argument:
      'She wrote that she would go where nobody could find them. Then she went, for nineteen days, and enrolled him in a new school. Whether or not she read the order, she knew he had a father.',
    defence_argument:
      'She went to her own mother’s house and signed her real name on the school form. Nobody served her; a paper was left with a stylist. The father swears he phoned her. His phone bill disagrees.',
    correct_verdict: 'ambiguous',
    evidence_strength: 0.05,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'He is seven. He was with his grandmother, in school, eating well. What exactly was I hiding?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Served at her own salon. How many times does a person need to be handed an order?' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'Four stylists and a queue out the door. Who did he give it to? Not me.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: '"Where nobody can find us." Her words. For nineteen days, nobody could.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'Written weeks before any order existed. You are being asked to convict a fear.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'Her real name. Her mother’s address. Her own number. The worst hiding place ever chosen.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'I told her about the order. I told her myself. I just want my boy home.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'startled', text: 'You told me? When? Show them the call. Show them one call.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'Fifteen years serving papers. I know who I handed it to.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Whatever she read or did not read, she knew that boy has a father.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Whatever you decide, please let someone tell him none of this was his fault.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['family', 'custody', 'passion'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['family', 'custody'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['courts', 'bureaucracy'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Smuggling contraband tobacco worth {MONEY_LARGE}',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 51,
      occupation: 'Long-haul truck driver, owner-operator',
      background:
        'Twenty-two years on the road without a single customs query. Tows sealed containers he never loads and is forbidden to open. Customs found undeclared cigarettes behind a false panel in the container he was pulling out of {DEPOT}.',
      wealth: 20,
      appearance: 66,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Customs seal on the container intact at inspection, its number matching the shipping manifest.',
        prosecution_reading: 'An intact seal means the load he collected is the load he carried, every kilometre of it.',
        defence_reading: 'An intact seal means nobody opened that container after it was loaded — including him.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'A second phone found under the passenger seat of the cab, with three calls to an unregistered number on the morning of the pickup.',
        prosecution_reading: 'Drivers with nothing to hide do not carry a second phone.',
        defence_reading:
          'No fingerprints on it at all — not his, not anyone’s. Wiped clean, then left under a seat for someone to find.',
        is_planted: true,
      },
      {
        id: 'e3',
        description: 'Payment of {MONEY_SMALL} to {D_LAST} for the run — three times his usual rate.',
        prosecution_reading: 'Triple pay for one run. Somebody was buying more than haulage.',
        defence_reading: 'Rush jobs pay triple. The broker’s invoices show the same rate paid to four other drivers that month.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'customs officer',
        testimony:
          'The driver was nervous and asked twice how long the inspection would take. I found the phone myself, under the passenger seat. Nobody entered that cab before me. I followed the search protocol to the letter.',
        lie: 'Yard camera footage shows a second officer inside the cab for four minutes before the recorded search.',
        lie_tell:
          '"Nobody entered that cab before me" — a claim about the whole yard, from a man standing at the back of the container.',
      },
      {
        name: '{W2_FULL}',
        role: 'freight broker who booked the run',
        testimony:
          'I booked {D_FIRST} because he was free and he was cheap. I never told him what was in the container, because I did not know myself. I handle paperwork, nothing more. I have never met the shipper face to face.',
        lie: 'Hotel records in {DISTRICT} show him and the shipper checking in together two days before the pickup.',
        lie_tell: '"Never met the shipper face to face" — distance claimed from a man nobody had asked him about.',
      },
    ],
    prosecution_argument:
      'Contraband in the container he towed, a second phone in his cab, and triple pay for one run. Twenty-two years on the road teaches a man exactly which loads pay too well.',
    defence_argument:
      'The seal was intact — he never touched that load. The phone surfaced after another officer spent four minutes alone in his cab. The broker was travelling with the shipper. The driver is the one link nobody bought.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.6,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'tense', text: 'I pull boxes. I do not open them. I am not allowed to open them.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'The load he collected is the load he carried. Every kilometre of it was his.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'The seal was never broken. So tell me when my client climbed inside.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'A second phone, three calls the morning of the pickup. Honest drivers manage with one.' },
      { speaker: 'defendant', cue: 'e2', tone: 'startled', text: 'That is not my phone. I had never seen that phone before they held it up.' },
      { speaker: 'defendant', cue: 'e3', tone: 'defiant', text: 'Triple pay for a rush job. Ask any driver in that yard if they would say no.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'I found the phone myself. I followed the protocol to the letter.' },
      { speaker: 'defence', cue: 'witness1', tone: 'calm', text: 'Alone, in a yard full of officers, and nobody went near that cab? Ask the yard camera.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'tense', text: 'I book trucks. I do not look inside containers. Nobody in my job does.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'defiant', text: 'He chose me because I was cheap. Ask him who else he knew in this deal.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Twenty-two years. Not one query. Please do not let one sealed box erase that.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['smuggling', 'labour', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['customs', 'systemic'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['smuggling', 'trade'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Attempting to cause grievous harm by poisoning',
    accent: 'passion',
    defendant: {
      name: '{D_FULL}',
      age: 49,
      occupation: 'Owner, {D_LAST}’s Kitchen, food stall at {MARKET}',
      background:
        'Ran the busiest food stall in the market for fifteen years, until a rival opened across the aisle and took half the lunch trade. The rival’s cook spent four days in hospital after drinking from a water drum the two stalls share. He recovered.',
      wealth: 48,
      appearance: 33,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Lab report: organophosphate pesticide in the shared water drum, at a dose enough to sicken but not to kill.',
        prosecution_reading: 'Measured. Enough to close a rival’s kitchen, not enough to hang for.',
        defence_reading:
          'The market sprays that same pesticide against rats every month, from a store two metres from the drum.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Receipt from an agricultural supplier: one litre of the same pesticide, bought by {D_LAST} eleven days before.',
        prosecution_reading: 'She bought the poison eleven days before the poisoning.',
        defence_reading: 'She grows tomatoes on a plot in {HOOD2}. Hundreds of people bought that bottle that month.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Market CCTV: {D_LAST} at the shared water drum at 05:40, forty minutes before any other trader arrived.',
        prosecution_reading: 'Alone at the drum, before dawn, before anyone could see.',
        defence_reading: 'She has opened first every day for fifteen years. Filling a kettle is how her morning starts.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'owner of the rival stall',
        testimony:
          'She told me in front of the whole aisle that I would not last the season. Before that we never had a real quarrel. I do not blame anybody. I only want to know who did this to my cook.',
        lie: 'The market committee minutes record three formal complaints between the two stalls this year, two of them filed by her.',
        lie_tell: '"We never had a real quarrel" — from someone who has filed two formal complaints about this one.',
      },
      {
        name: '{W2_FULL}',
        role: 'market cleaner',
        testimony:
          'I saw {D_FIRST} at the drum early, same as always. She had a small brown bottle I had never seen before. She poured something into her palm, then into the drum. I was sweeping right beside her. I am certain of what I saw.',
        lie: 'The cleaning rota puts him at the car park gate until 06:30 that morning.',
        lie_tell: '"Right beside her" — close enough to see the bottle, yet never close enough to be seen.',
      },
    ],
    prosecution_argument:
      'She told her rival she would not last the season. Eleven days later she bought the pesticide. At 05:40 she stood alone at the drum. By noon the rival’s cook was in hospital.',
    defence_argument:
      'The market sprays that pesticide monthly, beside the drum. Hundreds bought it. She opens first every day. The only eyewitness was at the car park gate. Rivalry is not poison.',
    correct_verdict: 'guilty',
    evidence_strength: 0.45,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'Fifteen years I have fed this market. Taste my food and then call me a poisoner.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Enough to sicken, not enough to kill. Whoever did this measured carefully.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'The rat-spray store is two metres from that drum. Has anyone questioned the sprayers?' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Eleven days before. The same pesticide. Her receipt. Her name.' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'For my tomatoes. Half of {MARKET} bought that bottle. Arrest them as well.' },
      { speaker: 'defendant', cue: 'e3', tone: 'calm', text: 'I open first. I have opened first every morning for fifteen years. Ask anyone.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: '"You will not last the season." She said it in front of the whole aisle.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'defiant', text: 'I say that to every new stall. Competition is not a crime.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I saw the bottle in her hand. Small, brown. I am sure.' },
      { speaker: 'defence', cue: 'witness2', tone: 'calm', text: 'Close enough to see the colour of a bottle, and she never once noticed him?' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'He is well again, thank God. Now give me back my name.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['poisoning', 'market', 'rivalry'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['market', 'rivalry'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['market', 'labour'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Theft of a necklace worth {MONEY_MID} from an employer',
    accent: 'passion',
    defendant: {
      name: '{D_FULL}',
      age: 42,
      occupation: 'Live-in housekeeper',
      background:
        'Nine years with the same family; raised their two children from infancy and sends most of her wages home to her own in {HOOD2}. The necklace went missing the week she asked for a raise and was refused.',
      wealth: 5,
      appearance: 80,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'The necklace’s clasp, wrapped in tissue inside the lining of {D_LAST}’s travel bag.',
        prosecution_reading: 'Part of the necklace, hidden in her own bag. The rest was already sold.',
        defence_reading: 'A clasp, not a necklace. Her bag hangs in an unlocked laundry room in a house where six people have keys.',
        is_planted: true,
      },
      {
        id: 'e2',
        description: 'Pawnshop register in {HOOD1}: a matching necklace pawned for {MONEY_SMALL} by a seller recorded only as "family member".',
        prosecution_reading: 'She lived with the family for nine years. She knew what to say at the counter.',
        defence_reading: '"Family member." Nobody would say that of a housekeeper. The seller told the pawnbroker who they were.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Message from {D_LAST} to her sister, two days before the loss: "If they will not pay me properly I will find another way."',
        prosecution_reading: 'She promised to pay herself another way. Then a year’s wages in gold vanished.',
        defence_reading: 'Another way means another job. She had an agency interview booked for the following Monday.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'employer, owner of the necklace',
        testimony:
          'The necklace was in my dressing table. Only {D_FIRST} cleaned that room. She was upset about the raise and I understood that. Nobody else in the house had any reason to take it. My son has never been in money trouble.',
        lie: 'Her son owes {MONEY_SMALL} to a betting shop; a demand letter was delivered to the house in March.',
        lie_tell: '"My son has never been in money trouble" — a defence of someone nobody had accused.',
      },
      {
        name: '{W2_FULL}',
        role: 'pawnbroker',
        testimony:
          'A young man came in. Or a young woman — I cannot swear to it, the shop is dark. They said it was a family piece. I remember the necklace, not the face. I never accept jewellery without seeing identity papers.',
        lie: 'His register has no identity entry for that necklace, or for anything else pawned that afternoon.',
        lie_tell: '"I never accept jewellery without identity papers" — a policy recited where a name should be.',
      },
    ],
    prosecution_argument:
      'Nine years of access, a quarrel over pay, a message promising another way, and the clasp in her own bag. She knew that room better than anyone alive.',
    defence_argument:
      'A clasp in an unlocked bag, a necklace pawned by "family", and a son in debt to a betting shop. She is the one person in that house who could never have pawned it as family.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.55,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'I raised her children. I sat up with them through every fever. Now I steal from them?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Wrapped in tissue, inside the lining of her bag. Who hides something that carefully?' },
      { speaker: 'defendant', cue: 'e1', tone: 'startled', text: 'My bag hangs in the laundry. Anyone in that house can open it. Anyone.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: '"A family member," says the register. She has been many things in that house. Never family.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: '"I will find another way." Two days later, something worth a year of her wages was gone.' },
      { speaker: 'defendant', cue: 'e3', tone: 'defiant', text: 'Another way meant another job. I had an interview on Monday. Call them.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'I trusted her with my children. With my children. Do you understand what that means?' },
      { speaker: 'defendant', cue: 'witness1', tone: 'pleading', text: 'Ask your son where he goes on Friday nights. Ask him. Not me.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'A young person, a family piece. I remember the necklace, not the face.' },
      { speaker: 'defence', cue: 'arguments', tone: 'calm', text: 'Of everyone in that house, she is the one the pawnbroker would never have called family.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'I have nothing but my name. If you take that, I go home with nothing at all.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['theft', 'labour', 'class', 'family'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['theft', 'wealth', 'family'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['theft', 'trade'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Forgery of a land title and obtaining property by deception',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 61,
      occupation: 'Licensed surveyor and land agent',
      background:
        'Surveyed half the plots in {HOOD1} over thirty years. A widow’s family plot was sold to a developer for {MONEY_LARGE} on a transfer bearing her late husband’s signature. {D_LAST} prepared the survey and witnessed the transfer.',
      wealth: 70,
      appearance: 25,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Land transfer bearing the late owner’s signature, dated six weeks after his death, witnessed by {D_LAST}.',
        prosecution_reading: 'A dead man signed this, and the surveyor stood by and watched him do it.',
        defence_reading:
          'The registry dates a transfer on the day it is lodged, not the day it is signed. The signature can predate the death.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Handwriting report: the owner’s signature is "probably not genuine"; the witness signature is certainly {D_LAST}’s.',
        prosecution_reading: 'A forged signature sitting beside his real one. He vouched for a forgery.',
        defence_reading: '"Probably not" is a shrug in a lab coat. His own signature proves only that he stood at a table.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Payment of {MONEY_MID} from the developer to {D_LAST}’s firm, invoiced as "survey and boundary services".',
        prosecution_reading: 'Ten times the going rate for one survey. That is a share, not a fee.',
        defence_reading: 'The invoice covers eight plots on the same road, surveyed over two years. The developer’s ledger lists all eight.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'the widow',
        testimony:
          'My husband never agreed to sell. That land was for our grandchildren. {D_FIRST} came to the house after the funeral and asked for the old deeds, to check the boundary. I gave them to him. I have never signed anything about that land.',
        lie: 'The registry holds a boundary-survey consent for that plot, signed by her in February.',
        lie_tell: '"I have never signed anything" — a lifetime of paperwork, flattened into a single sentence.',
      },
      {
        name: '{W2_FULL}',
        role: 'property developer, buyer of the plot',
        testimony:
          'I bought in good faith, from the owner, with a licensed surveyor witnessing. The owner came to my office in person — I met him twice. I paid {D_FIRST} for surveys, nothing else. I would never knowingly buy a disputed plot.',
        lie: 'His own travel records place him abroad on both dates he says he met the owner.',
        lie_tell: '"I met him twice" — meetings counted with the one man who can no longer confirm them.',
      },
    ],
    prosecution_argument:
      'A dead man’s signature, dated after his funeral, witnessed by the defendant. The developer paid his firm ten times a survey fee. He collected the deeds from the widow’s own table to do it.',
    defence_argument:
      'Transfers are dated when lodged. "Probably not" is not proof. The fee covers eight plots, not one. And the widow who swears she signed nothing signed a survey consent in February.',
    correct_verdict: 'guilty',
    evidence_strength: 0.55,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'Half of {HOOD1} stands on boundaries I drew. In thirty years not one has been challenged.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Dated six weeks after his funeral. Witnessed by the man sitting over there.' },
      { speaker: 'defendant', cue: 'e1', tone: 'defiant', text: 'The registry dates it when it is lodged. Every surveyor in this city knows that.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: '"Probably not." If that is their certainty, I would hate to hear their doubt.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'Ten times the rate for a survey. So what else did the developer buy?' },
      { speaker: 'defendant', cue: 'e3', tone: 'tense', text: 'Eight plots, two years, one invoice. Read the ledger, not the headline.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'pleading', text: 'He sat at my table after the funeral and asked for the deeds. I trusted him.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'ashamed', text: 'I knew her husband for twenty years. I would not do this to her.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'defiant', text: 'I bought in good faith. I met the owner. I paid for surveys. That is all.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'A dead man cannot sell his land. Somebody sold it for him.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'I am sixty-one. Whatever you decide, decide it on paper you actually trust.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['forgery', 'land', 'wealth'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['land', 'family', 'grief'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['land', 'construction'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Conspiracy to fix the result of a football match',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 31,
      occupation: 'Goalkeeper and captain, a second-division club in {DISTRICT}',
      background:
        'Club captain for four seasons, unpaid for the last five months after the owner went bankrupt. Conceded two late goals in a match on which {MONEY_LARGE} was staked overseas, most of it on exactly that scoreline.',
      wealth: 66,
      appearance: 58,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Betting data: {MONEY_LARGE} staked overseas on a 2–0 defeat, a scoreline normally offered at long odds.',
        prosecution_reading: 'Someone knew the result. Nobody on the pitch shapes a scoreline like the goalkeeper.',
        defence_reading: 'Someone knew. The data does not say who — and ten other players and a referee were on that pitch.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Match footage: {D_LAST} diving late for both goals, the second from thirty metres.',
        prosecution_reading: 'A keeper who stops thirty-metre shots every week, beaten twice in five minutes.',
        defence_reading:
          'The physiotherapist strapped his shoulder at half-time. He played on because the reserve keeper was not registered.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Messages between {D_LAST} and an overseas number the night before: "Ready for Saturday?" — "Ready."',
        prosecution_reading: 'An overseas number, the night before, asking if he was ready. He said he was.',
        defence_reading:
          'The number belongs to a former teammate playing abroad. The same exchange appears before forty consecutive matches.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'club physiotherapist',
        testimony:
          'I strapped his shoulder at half-time. He could barely lift the arm. I told the coach to take him off and there was nobody to bring on. I have worked at that club six years, and unlike some, I am always paid on time.',
        lie: 'The club payroll shows she, like every member of staff, had gone unpaid for five months.',
        lie_tell: '"I am always paid on time" — a remark about her own money that nobody had asked for.',
      },
      {
        name: '{W2_FULL}',
        role: 'league integrity officer',
        testimony:
          'The betting monitor raised the alert on Friday night, before the match. We flagged the goalkeeper because of the messages. Our analysts reviewed every minute of footage. There is no innocent explanation for the second goal.',
        lie: 'The monitor’s own timestamp shows the alert arriving on Sunday morning, after the match was over.',
        lie_tell: '"On Friday night, before the match" — a timeline that makes the league look vigilant, and does nothing else.',
      },
    ],
    prosecution_argument:
      'A scoreline known in advance overseas. A captain beaten from thirty metres. A message the night before: "Ready." Five months unpaid gives a man a reason, and he was wearing the gloves.',
    defence_argument:
      'Eleven players and a referee decide a scoreline. The physio strapped his shoulder at half-time. The "ready" messages go back forty weeks. The league flagged him after the match and pretends otherwise.',
    correct_verdict: 'ambiguous',
    evidence_strength: 0.2,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'Five months unpaid, and I still turned up every Saturday. Think about that.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Someone knew it would finish two-nil. Ask who on that pitch controls the scoreline.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'Eleven players and a referee. The betting data names not one of them.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'He stops thirty-metre shots every week. Not that day. Not that minute.' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'I could not lift my arm. I played because there was nobody else. Ask the physio.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: '"Ready for Saturday?" "Ready." You decide what he was ready for.' },
      { speaker: 'defendant', cue: 'e3', tone: 'defiant', text: 'He sends me that before every match. Forty weeks of the same message. Read them all.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'I strapped that shoulder myself. I told the coach to take him off.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'We flagged the goalkeeper before a ball was kicked. The system works.' },
      { speaker: 'defendant', cue: 'witness2', tone: 'startled', text: 'Before kick-off? Then why did nobody stop the match?' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Football is the only thing I have ever been good at. Please be certain.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['sport', 'corruption', 'labour'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['sport', 'labour'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['sport', 'systemic'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Dangerous driving causing serious injury',
    accent: 'violent',
    defendant: {
      name: '{D_FULL}',
      age: 48,
      occupation: 'Shuttle bus driver, {HOOD1} to {HOOD2} route',
      background:
        'Sixteen years behind the wheel with one parking fine. The bus belongs to a fleet company that failed two safety inspections last year. It left the road on the descent into {HOOD2}; three passengers were seriously injured.',
      wealth: 15,
      appearance: 40,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Vehicle examiner’s report: rear brake pads worn below the legal minimum; brake fluid low.',
        prosecution_reading: 'A driver checks his brakes. Worn pads are a driver’s failure before they are anyone else’s.',
        defence_reading: 'The fleet company’s own maintenance log shows the brake job booked, then cancelled twice to save money.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Telematics: bus travelling at 58 km/h in a 40 km/h zone on the descent, eleven seconds before leaving the road.',
        prosecution_reading: 'Eighteen over the limit, downhill, with passengers. That number is the crash.',
        defence_reading:
          'Speed rising on a descent is exactly what failing brakes look like. He was not accelerating; he was losing.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Driver’s daily check sheet for that morning, "brakes OK" ticked and signed by {D_LAST}.',
        prosecution_reading: 'He signed that the brakes were fine. Either he checked and was wrong, or he never checked.',
        defence_reading:
          'The company docks pay for any unticked box, and a walk-round check cannot see brake pads.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'fleet company operations director',
        testimony:
          'Every vehicle is maintained on schedule. Our drivers are trained to refuse any bus they are unhappy with, and none ever has. {D_FIRST} never reported a single problem with that vehicle. We have nothing to hide.',
        lie: 'A text from {D_LAST} to the depot two days earlier reads: "Brakes soft on the hill again."',
        lie_tell: '"Never reported a single problem" — the depot’s own phone was already in evidence when he said it.',
      },
      {
        name: '{W2_FULL}',
        role: 'injured passenger',
        testimony:
          'He was driving fast all morning, overtaking, like he was late for something. I told him to slow down at the stop before. He ignored me. I sat right behind him and watched the speedometer the whole way down the hill.',
        lie: 'The bus’s interior camera shows her in the back row, looking at her phone.',
        lie_tell: '"Watched the speedometer the whole way down" — a detail no passenger has, offered as though everyone does.',
      },
    ],
    prosecution_argument:
      'Eighteen over the limit, downhill, with a passenger telling him to slow down. He signed that his brakes were fine. Three people paid for that signature.',
    defence_argument:
      'He texted the depot that the brakes were soft. The company cancelled the repair twice. Rising speed on a hill is what failing brakes look like. The State has charged the man who warned them.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.5,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'I still hear them every night. Do you think I will ever stop hearing them?' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Worn below the legal limit. The driver is the last check on his own brakes.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'Booked and cancelled, twice. Ask the company why. Not the driver.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Fifty-eight in a forty, on a hill full of passengers. That number is the crash.' },
      { speaker: 'defendant', cue: 'e2', tone: 'tense', text: 'My foot was on the floor. The speed kept climbing. Have you ever felt that?' },
      { speaker: 'defendant', cue: 'e3', tone: 'ashamed', text: 'Everyone ticks that box. Leave one empty and they dock your wages.' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'He signed that the brakes were fine. Was he wrong, or did he never look?' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'Every vehicle is maintained on schedule. We have nothing to hide.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'defiant', text: 'On schedule? Then read my message from Tuesday. Read it out loud.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'tense', text: 'He drove like a madman all morning. I told him to slow down.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Sixteen years. One parking fine. Please look at the bus, not only at me.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['driving', 'labour', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['transport', 'corporate'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['driving', 'injury'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Theft of {MONEY_MID} from a congregation’s building fund',
    accent: 'financial',
    defendant: {
      name: '{D_FULL}',
      age: 57,
      occupation: 'Volunteer treasurer, {HOOD2} congregation building fund',
      background:
        'Kept the congregation’s books for twenty years without pay. The fund was raising money for a new roof when a spot audit found {MONEY_MID} missing. The committee chair, who co-signs every withdrawal, brought the complaint.',
      wealth: 55,
      appearance: 71,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Six cash withdrawals from the fund over four months, each co-signed by {D_LAST} and the committee chair.',
        prosecution_reading: 'Her signature on every withdrawal. A treasurer answers for the treasury.',
        defence_reading: 'Two signatures on every slip. The State has charged one of them.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Cash book in {D_LAST}’s handwriting, with six pages torn out covering the same four months.',
        prosecution_reading: 'The pages that would show where the money went — torn from her own book.',
        defence_reading: 'The book was kept in the office safe, and the chair holds the only other key.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'Receipts for roofing materials worth {MONEY_SMALL}, bought for the fund by {D_LAST} from a supplier that has since closed.',
        prosecution_reading: 'Receipts from a supplier nobody can find. Paper is cheap.',
        defence_reading: 'The materials are stacked behind the hall. The auditor counted them himself.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'committee chair',
        testimony:
          'I signed whatever {D_FIRST} put in front of me. We all trusted her completely. I never handled the cash myself. I have not opened the office safe in years — that was her responsibility, not mine.',
        lie: 'The safe’s electronic log shows his key used nine times in those four months.',
        lie_tell: '"I have not opened the office safe in years" — the one place in this case that keeps a log.',
      },
      {
        name: '{W2_FULL}',
        role: 'volunteer auditor',
        testimony:
          'The numbers did not reconcile. When I asked {D_FIRST} for the cash book she said it was at home, and she was upset. When I finally saw it, the pages were gone. I have no view on who took the money. I only count.',
        lie: 'His own audit notes record that the chair, not {D_LAST}, said the book was at home.',
        lie_tell: '"She said it was at home" — a line his own notes put in someone else’s mouth.',
      },
    ],
    prosecution_argument:
      'Her signature on every withdrawal. Her handwriting in the cash book. Six pages torn from exactly the months the money left. A treasurer is trusted with one thing, and it is gone.',
    defence_argument:
      'Every withdrawal carries two signatures. The book lived in a safe the chair opened nine times while swearing he never did. She kept those books twenty years for nothing. Look at the other signature.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.45,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'Twenty years I kept those books. Never a wage. Never a complaint. Until this roof.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Six withdrawals. Six times her name. The treasurer answers for the treasury.' },
      { speaker: 'defence', cue: 'e1', tone: 'calm', text: 'Six times her name — and six times his. Why is only one of them in the dock?' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Six pages torn out, covering exactly those months. Who tears out their own handwriting?' },
      { speaker: 'defendant', cue: 'e2', tone: 'startled', text: 'That book lives in the safe. I am not the only one with a key.' },
      { speaker: 'defence', cue: 'e3', tone: 'calm', text: 'The roofing is stacked behind the hall. The auditor counted it with his own hands.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'I signed what was put in front of me. We all trusted her. That was our mistake.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'defiant', text: 'Put in front of you? You chose the days. You chose the amounts.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I count. The numbers did not add up. I have no side in this.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'Trust is exactly what a thief needs. Twenty years of it is a great deal.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Whatever you decide, I have to face that congregation again. Let me face them with my name.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['embezzlement', 'faith', 'community'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['embezzlement', 'community'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['audit', 'community'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Unauthorised access to and disclosure of confidential hospital records',
    accent: 'systemic',
    defendant: {
      name: '{D_FULL}',
      age: 34,
      occupation: 'Records officer at a public hospital in {DISTRICT}',
      background:
        'Seven years in medical records with a clean file. A newspaper printed internal figures showing one surgical ward had under-reported its deaths. Two weeks earlier she had filed a formal whistleblower report with the health regulator. The hospital says she also leaked to the press.',
      wealth: 42,
      appearance: 55,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Access log: {D_LAST}’s account opened 214 ward mortality files in the week before her regulator report.',
        prosecution_reading: 'Two hundred files outside her normal work. That is collecting, not filing.',
        defence_reading: 'Records officers open files for a living. She was building the report the law protects her for making.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'The leaked page as printed by the newspaper, with a printer watermark tracing it to a terminal on the surgical floor.',
        prosecution_reading: 'A hospital document on a front page. Someone inside handed it over, and she had the figures.',
        defence_reading: 'Her account never logged in to a surgical-floor terminal. Medical records is two buildings away.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'A USB stick in {D_LAST}’s desk drawer containing the mortality figures.',
        prosecution_reading: 'The figures, on a stick, in her drawer. Portable, and ready to hand over.',
        defence_reading: 'The regulator asked her in writing to submit the figures on a USB stick. This is that stick.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'hospital medical director',
        testimony:
          'Our figures were under review, not concealed. The leak damaged patients’ confidence in the hospital. {D_FIRST} had no business opening those files. I first learned of any regulator report from the newspaper, like everyone else.',
        lie: 'The regulator’s letter notifying the hospital of her report was addressed to him and signed for eight days before publication.',
        lie_tell: '"Like everyone else" — placing himself in a crowd he was never part of.',
      },
      {
        name: '{W2_FULL}',
        role: 'journalist who published the figures',
        testimony:
          'I will not name my source. I can say the document reached me on paper, in an envelope, with no note. I have never met {D_FIRST}. I have never spoken to her, by phone or otherwise.',
        lie: 'Her own article on hospital waiting lists, published in April, quotes {D_LAST} by name.',
        lie_tell: '"Never met … never spoken to her, by phone or otherwise" — two denials where one would have served.',
      },
    ],
    prosecution_argument:
      'Two hundred files opened. The figures on a stick in her drawer. The same figures on a front page. The law protects a report to the regulator. It does not protect a leak to a newspaper.',
    defence_argument:
      'The regulator asked for that stick in writing. The leaked page came from a terminal she never used. The director knew of her report a week before he admits. This is retaliation, filed as a charge.',
    correct_verdict: 'not_guilty',
    evidence_strength: -0.45,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'defiant', text: 'I reported it to exactly the people the law told me to. Nobody else.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Two hundred and fourteen files in one week. That is not filing. That is collecting.' },
      { speaker: 'defendant', cue: 'e1', tone: 'tense', text: 'Records is my job. Should I have guessed the numbers instead of checking them?' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'Printed on the surgical floor, two buildings from her desk. Who works on that floor?' },
      { speaker: 'prosecution', cue: 'e3', tone: 'calm', text: 'The figures on a stick, in her drawer. Easy to carry. Easy to hand across a table.' },
      { speaker: 'defendant', cue: 'e3', tone: 'startled', text: 'The regulator asked for that stick. In writing. It is in your own bundle.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'calm', text: 'Our figures were under review. She damaged the trust of every patient we treat.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'defiant', text: 'Under review for how long? Ask him how many families were ever told.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'I will not name my source. Not here, not anywhere.' },
      { speaker: 'prosecution', cue: 'arguments', tone: 'calm', text: 'A regulator is a door. A front page is a window. The law only opens one.' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'If you convict me, the next person who sees those numbers stays silent. Is that what you want?' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['whistleblowing', 'health', 'systemic'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['health', 'systemic', 'power'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['press', 'whistleblowing'] },
    ],
  },
  {
    title: 'The State v. {D_FULL}',
    charge: 'Stalking causing fear of violence',
    accent: 'passion',
    defendant: {
      name: '{D_FULL}',
      age: 38,
      occupation: 'Architect in private practice',
      background:
        'Designed two of the city’s public libraries. Separated from the complainant, a former colleague, after three years together. She moved to {HOOD2} and changed her number. Over five months she received ninety-one messages from new accounts.',
      wealth: 72,
      appearance: 68,
      // demeanour and oddity are re-rolled per serve by
      // stripPresentation — authored cases have FIXED
      // verdicts, so a fixed presentation would be perfectly
      // correlated with guilt. These are placeholders only.
      demeanour: 50,
      oddity: 50,
    },
    evidence: [
      {
        id: 'e1',
        description: 'Ninety-one messages from eleven newly created accounts, none registered to {D_LAST}, several quoting private jokes from the relationship.',
        prosecution_reading: 'Anonymous accounts that know things only he would know. That is a signature.',
        defence_reading:
          'Three years together means friends, family, old photographs — and a great many people who heard those jokes.',
        is_planted: false,
      },
      {
        id: 'e2',
        description: 'Phone location: {D_LAST}’s phone within 300 metres of the complainant’s building on fourteen evenings.',
        prosecution_reading: 'Fourteen evenings outside the building of a woman who moved to get away from him.',
        defence_reading: 'His studio moved to the same {HOOD2} high street last year. Three hundred metres is his walk to the train.',
        is_planted: false,
      },
      {
        id: 'e3',
        description: 'A laptop seized from {D_LAST}’s studio, used to log in to four of the eleven accounts.',
        prosecution_reading: 'His laptop, logging in to the accounts. Very little is left to explain.',
        defence_reading: 'A studio laptop shared by four staff and two interns, with an open guest profile and no password.',
        is_planted: false,
      },
    ],
    witnesses: [
      {
        name: '{W1_FULL}',
        role: 'complainant, former partner',
        testimony:
          'I changed my number, my address, my route to work. Every time, within a week, a new account found me. I saw him across from my building four times. He never came close enough to speak. I have not contacted him once since we separated.',
        lie: 'In February she messaged him asking him to return a box of her belongings.',
        lie_tell: '"Not once since we separated" — a total, in a separation where loose ends are normal.',
      },
      {
        name: '{W2_FULL}',
        role: 'concierge at the complainant’s building',
        testimony:
          'I saw him on the pavement opposite, four or five times, always around seven. He never came to the door. The last time he was holding something up — a phone, I think. I have never spoken to him. I know his face.',
        lie: 'His duty rota shows he was not working on two of the evenings he describes.',
        lie_tell: '"Four or five times" — a count that shifts inside a single sentence.',
      },
    ],
    prosecution_argument:
      'Eleven accounts that know her private jokes. His phone outside her building on fourteen evenings. His laptop logging in to four of the accounts. She moved to escape him, and the messages moved with her.',
    defence_argument:
      'Anonymous accounts, a shared laptop with no password, and a studio on her new high street. The concierge describes evenings he was not at work. Proximity and a bad breakup are not a crime.',
    correct_verdict: 'guilty',
    evidence_strength: 0.5,
    courtroom_lines: [
      { speaker: 'defendant', cue: 'open', tone: 'calm', text: 'I have put my name on every building I ever made. I do not hide behind anything.' },
      { speaker: 'prosecution', cue: 'e1', tone: 'calm', text: 'Jokes only two people shared. Eleven accounts. One of those two people is sitting there.' },
      { speaker: 'defendant', cue: 'e1', tone: 'tense', text: 'Three years together. Half our friends heard those jokes at dinner. Ask them.' },
      { speaker: 'prosecution', cue: 'e2', tone: 'calm', text: 'Fourteen evenings outside the building she moved to so she would never see him again.' },
      { speaker: 'defence', cue: 'e2', tone: 'calm', text: 'His studio is on that street. Should he walk to work through another city?' },
      { speaker: 'defendant', cue: 'e3', tone: 'defiant', text: 'Six people use that laptop and it has no password. You could log in yourself.' },
      { speaker: 'witness1', cue: 'witness1', tone: 'tense', text: 'I moved house to be free of this. Everywhere I went, it followed me.' },
      { speaker: 'defendant', cue: 'witness1', tone: 'pleading', text: 'I have not tried to find you. Please. Look at me when you say it.' },
      { speaker: 'witness2', cue: 'witness2', tone: 'calm', text: 'Across the street, around seven, four or five times. I know that face.' },
      { speaker: 'defence', cue: 'witness2', tone: 'calm', text: 'He knows the face. Does he know which evenings he was actually at work?' },
      { speaker: 'defendant', cue: 'late', tone: 'pleading', text: 'Convict me and she is still afraid. Whoever is sending those messages will still be out there.' },
    ],
    character_pool_additions: [
      { name: '{D_FULL}', role: 'defendant', themes: ['stalking', 'relationships', 'technology'] },
      { name: '{W1_FULL}', role: 'witness', themes: ['stalking', 'relationships', 'fear'] },
      { name: '{W2_FULL}', role: 'witness', themes: ['neighbours', 'security'] },
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
