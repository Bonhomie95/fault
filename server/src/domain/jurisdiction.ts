import type { Tier } from '@prisma/client';

/**
 * The ladder.
 *
 * You start where you live. Every rung outward is somewhere you had to be
 * trusted to reach, and the shape of the ladder depends on where you started:
 * a Norwegian juror climbs toward the EU, a Kenyan one toward the African
 * Union. Both end at the same place, which is the point.
 *
 * IMPORTANT: jurisdictions and police services named here are real, and are
 * used as *setting* only. Every person in a case — defendant, witness,
 * officer, counsel — is fictional. That line is enforced in the generator's
 * system prompt and content filter.
 */

export const TIER_ORDER: Tier[] = [
  'district',
  'state',
  'national',
  'supranational',
  'international',
  'world',
];

/**
 * The texture a fallback case needs to belong somewhere.
 *
 * The AI gets all of this implicitly from the country name. The authored
 * docket does not — it is fixed prose — so anything culture-specific in it has
 * to be a slot that this fills. Without these, the offline docket hands a
 * juror in Bergen a case about a danfo driver priced in naira.
 */
export interface CountryTexture {
  givenNames: string[];
  surnames: string[];
  /** A big public market, by its real name where there is an obvious one. */
  market: string;
  /** Ordinary working neighbourhoods. */
  neighbourhoods: string[];
  /** What driving for a living is called here. */
  transportJob: string;
  /** A goods depot or freight yard. */
  depot: string;
  /**
   * Sums that mean the same thing in each economy — a modest theft, a serious
   * one, a life's savings. Not conversions: ₦400,000 and NOK 40,000 are
   * nothing alike numerically and identical dramatically.
   */
  money: { small: string; mid: string; large: string; huge: string };
}

/**
 * The local paper, by district.
 *
 * FICTIONAL, deliberately, and this is not the same call as the courts.
 * A police district is a public institution and depicting one in fiction is
 * ordinary; a newspaper is a private company, and printing invented stories
 * under a real masthead is straightforwardly defamatory in a way "Oslo
 * politidistrikt investigated a fictional theft" is not. So the city is real
 * and the paper is ours.
 *
 * "Herald" reads as a paper in every English-speaking market and is generic
 * enough not to collide with a real title in the others.
 */
export function newspaperFor(district: string): string {
  return `THE ${district.toUpperCase()} HERALD`;
}

export interface CountryProfile {
  /** ISO 3166-1 alpha-2 */
  code: string;
  name: string;
  localeTag: string;
  currency: string;
  texture: CountryTexture;
  /** What the second rung is actually called here. */
  stateNoun: string;
  /** The supranational bench this country answers to, if any. */
  supranational: string | null;
  /** Real districts a player can be assigned to. */
  districts: string[];
  /** The real police service, per district where it differs. */
  policeService: (district: string) => string;
  /** The real court name at a given tier. */
  courtName: (tier: Tier, district: string) => string;
  /** Naming register for generated people — fictional individuals, real texture. */
  nameRegister: string;
}

const eu = 'European Union';
const au = 'African Union';
const echr = 'European Court of Human Rights';
const iachr = 'Inter-American Court of Human Rights';
const ccj = 'Caribbean Court of Justice';

// The benches above, as a court name reads in a sentence.
const CJEU = 'the Court of Justice of the European Union';
const ECHR = 'the European Court of Human Rights';
const ICJ = 'the International Court of Justice';
const AFCHPR = 'the African Court on Human and Peoples’ Rights';
// AU members that have not ratified the Court's protocol still answer to the
// Charter's own body, the Commission in Banjul.
const ACHPR = 'the African Commission on Human and Peoples’ Rights';
const CIDH = 'Corte Interamericana de Derechos Humanos';

/** A per-district name, for countries where the institution differs by city. */
function at(table: Record<string, string>, district: string, fallback: string): string {
  return table[district] ?? fallback;
}

/**
 * Countries we localise properly. Anywhere else falls back to a generic
 * profile that still uses the player's real country name and locale, so an
 * unlisted country degrades to plausible rather than to Orun City.
 */
export const COUNTRIES: Record<string, CountryProfile> = {
  NO: {
    code: 'NO',
    name: 'Norway',
    localeTag: 'nb-NO',
    currency: 'NOK',
    texture: {
      givenNames: ['Ingrid', 'Lars', 'Kari', 'Sindre', 'Astrid', 'Kjetil', 'Maja', 'Håkon', 'Amina', 'Emil'],
      surnames: ['Solberg', 'Haugen', 'Jensen', 'Pedersen', 'Fjell', 'Dahl', 'Berg', 'Osman', 'Lund', 'Vik'],
      market: 'Torvet market hall',
      neighbourhoods: ['Grønland', 'Tøyen', 'Holmlia', 'Bjørvika'],
      transportJob: 'delivery driver',
      depot: 'the harbour freight depot',
      money: { small: 'NOK 40,000', mid: 'NOK 250,000', large: 'NOK 1.8 million', huge: 'NOK 40 million' },
    },
    stateNoun: 'fylke',
    supranational: 'European Economic Area / EFTA Court',
    districts: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø'],
    policeService: (d) => `${d} politidistrikt`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} tingrett`;
      if (tier === 'state') return 'Borgarting lagmannsrett';
      if (tier === 'national') return 'Høyesterett';
      return 'EFTA-domstolen';
    },
    nameRegister: 'Norwegian given names and surnames (Ingrid Solberg, Lars Haugen)',
  },
  US: {
    code: 'US',
    name: 'the United States',
    localeTag: 'en-US',
    currency: 'USD',
    texture: {
      givenNames: ['Marcus', 'Dana', 'Luis', 'Tasha', 'Ray', 'Nicole', 'Andre', 'Beth', 'Hector', 'Shauna'],
      surnames: ['Whitaker', 'Delgado', 'Brennan', 'Okafor', 'Vance', 'Rios', 'Coleman', 'Nowak', 'Pike', 'Halloran'],
      market: 'the Eastside public market',
      neighbourhoods: ['Southside', 'Riverbend', 'the Flats', 'Lincoln Heights'],
      transportJob: 'rideshare driver',
      depot: 'the Canal Street distribution depot',
      money: { small: '$4,000', mid: '$26,000', large: '$180,000', huge: '$4 million' },
    },
    stateNoun: 'state',
    supranational: null, // no supranational bench; the ladder skips a rung
    districts: ['Chicago', 'Baltimore', 'Oakland', 'Phoenix', 'Detroit'],
    policeService: (d) => `${d} Police Department`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Municipal Court`;
      if (tier === 'state') return 'State Superior Court';
      if (tier === 'national') return 'United States District Court';
      return 'International Court of Justice';
    },
    nameRegister: 'American given names and surnames across varied backgrounds',
  },
  GB: {
    code: 'GB',
    name: 'the United Kingdom',
    localeTag: 'en-GB',
    currency: 'GBP',
    texture: {
      givenNames: ['Aisha', 'Callum', 'Nadia', 'Gareth', 'Priya', 'Dean', 'Roisin', 'Marcus', 'Chloe', 'Tomasz'],
      surnames: ['Whitfield', 'Ahmed', 'Doherty', 'Okonkwo', 'Bradshaw', 'Kaur', 'Nowak', 'Fenton', 'Adeyemi', 'Crowe'],
      market: 'the Arndale market',
      neighbourhoods: ['Moss Side', 'Salford Quays', 'Longsight', 'Ancoats'],
      transportJob: 'private hire driver',
      depot: 'the Trafford Park depot',
      money: { small: '£3,000', mid: '£22,000', large: '£150,000', huge: '£3.4 million' },
    },
    stateNoun: 'region',
    supranational: 'European Court of Human Rights',
    districts: ['Manchester', 'Birmingham', 'Glasgow', 'Leeds', 'Bristol'],
    policeService: (d) => (d === 'Glasgow' ? 'Police Scotland' : `${d} Constabulary`),
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates' Court`;
      if (tier === 'state') return `${d} Crown Court`;
      if (tier === 'national') return 'the Court of Appeal';
      return 'the European Court of Human Rights';
    },
    nameRegister: 'British given names and surnames across varied backgrounds',
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    localeTag: 'en-NG',
    currency: 'NGN',
    texture: {
      givenNames: ['Adaeze', 'Emeka', 'Folake', 'Ibrahim', 'Chinelo', 'Yemi', 'Hauwa', 'Tunde', 'Ngozi', 'Bashir'],
      surnames: ['Nwosu', 'Obi', 'Adebayo', 'Sule', 'Eze', 'Balogun', 'Chukwu', 'Lawal', 'Okafor', 'Danjuma'],
      market: 'Balogun Market',
      neighbourhoods: ['Ikorodu', 'Ojuelegba', 'Surulere', 'Mushin'],
      transportJob: 'danfo driver',
      depot: 'the Apapa container depot',
      money: { small: '₦400,000', mid: '₦2,000,000', large: '₦18,000,000', huge: '₦180 million' },
    },
    stateNoun: 'state',
    supranational: au,
    districts: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Ibadan'],
    policeService: (d) => `${d} State Police Command`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate Court`;
      if (tier === 'state') return `${d} State High Court`;
      if (tier === 'national') return 'the Supreme Court of Nigeria';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'Nigerian given names and surnames (Yoruba, Igbo, Hausa)',
  },
  KE: {
    code: 'KE',
    name: 'Kenya',
    localeTag: 'en-KE',
    currency: 'KES',
    texture: {
      givenNames: ['Wanjiru', 'Otieno', 'Amina', 'Kipchoge', 'Njeri', 'Musa', 'Achieng', 'Brian', 'Fatuma', 'Kamau'],
      surnames: ['Mwangi', 'Ochieng', 'Kariuki', 'Wekesa', 'Njoroge', 'Abdi', 'Omondi', 'Chebet', 'Mutiso', 'Were'],
      market: 'Gikomba market',
      neighbourhoods: ['Eastleigh', 'Kibera', 'Kasarani', 'Umoja'],
      transportJob: 'matatu driver',
      depot: 'the Industrial Area goods depot',
      money: { small: 'KSh 90,000', mid: 'KSh 600,000', large: 'KSh 4,500,000', huge: 'KSh 90 million' },
    },
    stateNoun: 'county',
    supranational: au,
    districts: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'],
    policeService: (d) => `${d} County Police Command`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate's Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Supreme Court of Kenya';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'Kenyan given names and surnames',
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    localeTag: 'de-DE',
    currency: 'EUR',
    texture: {
      givenNames: ['Lena', 'Jonas', 'Fatma', 'Stefan', 'Aylin', 'Matthias', 'Katrin', 'Mehmet', 'Sofia', 'Bernd'],
      surnames: ['Kraus', 'Yilmaz', 'Hoffmann', 'Schuster', 'Öztürk', 'Brandt', 'Weiß', 'Nowak', 'Richter', 'Behrens'],
      market: 'the Markthalle',
      neighbourhoods: ['Neukölln', 'Wedding', 'Marzahn', 'Kreuzberg'],
      transportJob: 'delivery driver',
      depot: 'the Westhafen freight depot',
      money: { small: '€3,500', mid: '€24,000', large: '€160,000', huge: '€3.8 million' },
    },
    stateNoun: 'Land',
    supranational: eu,
    districts: ['Berlin', 'Hamburg', 'München', 'Köln', 'Leipzig'],
    policeService: (d) => `Polizei ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Amtsgericht ${d}`;
      if (tier === 'state') return `Landgericht ${d}`;
      if (tier === 'national') return 'der Bundesgerichtshof';
      return 'der Europäische Gerichtshof';
    },
    nameRegister: 'German given names and surnames',
  },
  FR: {
    code: 'FR',
    name: 'France',
    localeTag: 'fr-FR',
    currency: 'EUR',
    texture: {
      givenNames: ['Camille', 'Karim', 'Élodie', 'Thomas', 'Aïcha', 'Julien', 'Sofia', 'Mathieu', 'Fanta', 'Bruno'],
      surnames: ['Marchand', 'Benali', 'Lefèvre', 'Traoré', 'Rousseau', 'Diallo', 'Girard', 'Nguyen', 'Perrin', 'Sow'],
      market: 'the marché couvert',
      neighbourhoods: ['Barbès', 'Saint-Denis', 'Belleville', 'La Courneuve'],
      transportJob: 'delivery driver',
      depot: 'the Bercy freight depot',
      money: { small: '€3,500', mid: '€24,000', large: '€160,000', huge: '€3.8 million' },
    },
    stateNoun: 'région',
    supranational: eu,
    districts: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Lille'],
    policeService: (d) => `Police nationale — ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal judiciaire de ${d}`;
      if (tier === 'state') return `Cour d'appel de ${d}`;
      if (tier === 'national') return 'la Cour de cassation';
      return 'la Cour de justice de l’Union européenne';
    },
    nameRegister: 'French given names and surnames',
  },
  IN: {
    code: 'IN',
    name: 'India',
    localeTag: 'en-IN',
    currency: 'INR',
    texture: {
      givenNames: ['Priya', 'Rohit', 'Meera', 'Arjun', 'Fatima', 'Vikram', 'Ananya', 'Sameer', 'Lakshmi', 'Imran'],
      surnames: ['Sharma', 'Iyer', 'Khan', 'Reddy', 'Desai', 'Banerjee', 'Pillai', 'Chauhan', 'Fernandes', 'Nair'],
      market: 'Crawford Market',
      neighbourhoods: ['Dharavi', 'Andheri', 'Byculla', 'Malad'],
      transportJob: 'auto-rickshaw driver',
      depot: 'the Sewri goods depot',
      money: { small: '₹3,00,000', mid: '₹18,00,000', large: '₹1.4 crore', huge: '₹32 crore' },
    },
    stateNoun: 'state',
    supranational: null,
    districts: ['Mumbai', 'Delhi', 'Bengaluru', 'Kolkata', 'Chennai'],
    policeService: (d) => `${d} Police`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Sessions Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Supreme Court of India';
      return 'the International Court of Justice';
    },
    nameRegister: 'Indian given names and surnames across regions',
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    localeTag: 'pt-BR',
    currency: 'BRL',
    texture: {
      givenNames: ['Camila', 'Rafael', 'Luana', 'Thiago', 'Beatriz', 'Marcos', 'Juliana', 'Everton', 'Nara', 'Caio'],
      surnames: ['Oliveira', 'Ferreira', 'Nascimento', 'Barbosa', 'Cardoso', 'Ramos', 'Teixeira', 'Moreira', 'Pinto', 'Vasconcelos'],
      market: 'the Mercadão',
      neighbourhoods: ['Brás', 'Capão Redondo', 'Cidade Tiradentes', 'Grajaú'],
      transportJob: 'app driver',
      depot: 'the Barra Funda freight depot',
      money: { small: 'R$ 18,000', mid: 'R$ 120,000', large: 'R$ 900,000', huge: 'R$ 20 million' },
    },
    stateNoun: 'estado',
    supranational: 'Mercosur / Inter-American Court of Human Rights',
    districts: ['São Paulo', 'Rio de Janeiro', 'Salvador', 'Recife', 'Porto Alegre'],
    policeService: (d) => `Polícia Civil de ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Vara Criminal de ${d}`;
      if (tier === 'state') return `Tribunal de Justiça de ${d}`;
      if (tier === 'national') return 'o Supremo Tribunal Federal';
      return 'a Corte Interamericana de Direitos Humanos';
    },
    nameRegister: 'Brazilian given names and surnames',
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    localeTag: 'en-ZA',
    currency: 'ZAR',
    texture: {
      givenNames: ['Thandiwe', 'Sipho', 'Lerato', 'Pieter', 'Nomsa', 'Riaan', 'Zanele', 'Ayanda', 'Fatima', 'Bongani'],
      surnames: ['Dlamini', 'Van Wyk', 'Mokoena', 'Naidoo', 'Botha', 'Nkosi', 'Petersen', 'Khumalo', 'Adams', 'Sithole'],
      market: 'the Yeoville market',
      neighbourhoods: ['Soweto', 'Alexandra', 'Hillbrow', 'Mitchells Plain'],
      transportJob: 'minibus taxi driver',
      depot: 'the City Deep container depot',
      money: { small: 'R 45,000', mid: 'R 300,000', large: 'R 2,200,000', huge: 'R 48 million' },
    },
    stateNoun: 'province',
    supranational: au,
    districts: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Gqeberha'],
    policeService: (d) => `SAPS ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate's Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Constitutional Court';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'South African given names and surnames across communities',
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    localeTag: 'en-CA',
    currency: 'CAD',
    texture: {
      givenNames: ['Emily', 'Liam', 'Chloé', 'Jaskaran', 'Olivia', 'Mathieu', 'Mei', 'Ryan', 'Nadia', 'Owen'],
      surnames: ['Tremblay', 'MacDonald', 'Singh', 'Wong', 'Gagnon', 'Campbell', 'Nguyen', 'Roy', 'Patel', 'Thompson'],
      market: 'St. Lawrence Market',
      neighbourhoods: ['Scarborough', 'Parkdale', 'Weston', 'Thorncliffe Park'],
      transportJob: 'rideshare driver',
      depot: 'the Etobicoke freight depot',
      money: { small: '$5,000', mid: '$35,000', large: '$240,000', huge: '$5 million' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Ottawa'],
    policeService: (d) =>
      at(
        {
          Toronto: 'Toronto Police Service',
          Montréal: 'Service de police de la Ville de Montréal',
          Vancouver: 'Vancouver Police Department',
          Calgary: 'Calgary Police Service',
          Ottawa: 'Ottawa Police Service',
        },
        d,
        `${d} Police Service`,
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Montréal: 'Cour du Québec',
            Vancouver: 'Provincial Court of British Columbia',
            Calgary: 'Alberta Court of Justice',
          },
          d,
          'Ontario Court of Justice',
        );
      if (tier === 'state')
        return at(
          {
            Montréal: 'Cour supérieure du Québec',
            Vancouver: 'Supreme Court of British Columbia',
            Calgary: 'Court of King’s Bench of Alberta',
          },
          d,
          'Ontario Superior Court of Justice',
        );
      if (tier === 'national') return 'the Supreme Court of Canada';
      return ICJ;
    },
    nameRegister: 'Canadian given names and surnames, anglophone, francophone and immigrant',
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    localeTag: 'en-AU',
    currency: 'AUD',
    texture: {
      givenNames: ['Chloe', 'Jack', 'Mei', 'Lachlan', 'Priya', 'Nathan', 'Olivia', 'Tom', 'Fatima', 'Hamish'],
      surnames: ['Smith', 'Nguyen', 'Kelly', 'Papadopoulos', 'Wilson', 'Chen', 'O’Brien', 'Singh', 'Russo', 'Taylor'],
      market: 'Paddy’s Markets',
      neighbourhoods: ['Blacktown', 'Parramatta', 'Mount Druitt', 'Bankstown'],
      transportJob: 'courier driver',
      depot: 'the Port Botany freight depot',
      money: { small: '$5,000', mid: '$35,000', large: '$250,000', huge: '$5 million' },
    },
    stateNoun: 'state',
    supranational: null,
    districts: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
    policeService: (d) =>
      at(
        {
          Sydney: 'NSW Police Force',
          Melbourne: 'Victoria Police',
          Brisbane: 'Queensland Police Service',
          Perth: 'Western Australia Police Force',
          Adelaide: 'South Australia Police',
        },
        d,
        'NSW Police Force',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return d === 'Sydney' ? 'the Local Court of New South Wales' : `${d} Magistrates Court`;
      if (tier === 'state')
        return at(
          {
            Melbourne: 'the Supreme Court of Victoria',
            Brisbane: 'the Supreme Court of Queensland',
            Perth: 'the Supreme Court of Western Australia',
            Adelaide: 'the Supreme Court of South Australia',
          },
          d,
          'the Supreme Court of New South Wales',
        );
      if (tier === 'national') return 'the High Court of Australia';
      return ICJ;
    },
    nameRegister: 'Australian given names and surnames across varied backgrounds',
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    localeTag: 'en-NZ',
    currency: 'NZD',
    texture: {
      givenNames: ['Aroha', 'Tama', 'Olivia', 'Sione', 'Mere', 'Liam', 'Grace', 'Wiremu', 'Mei', 'James'],
      surnames: ['Smith', 'Ngata', 'Williams', 'Tupou', 'Brown', 'Patel', 'Walker', 'Henare', 'Taufa', 'Wang'],
      market: 'the Ōtara Markets',
      neighbourhoods: ['Ōtara', 'Māngere', 'Onehunga', 'Henderson'],
      transportJob: 'courier driver',
      depot: 'the Southdown freight depot',
      money: { small: '$5,000', mid: '$35,000', large: '$250,000', huge: '$5 million' },
    },
    stateNoun: 'region',
    supranational: null,
    districts: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Dunedin'],
    policeService: () => 'New Zealand Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District Court`;
      if (tier === 'state') return `the High Court at ${d}`;
      if (tier === 'national') return 'the Supreme Court of New Zealand';
      return ICJ;
    },
    nameRegister: 'New Zealand given names and surnames — Pākehā, Māori, Pasifika and Asian',
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    localeTag: 'en-IE',
    currency: 'EUR',
    texture: {
      givenNames: ['Aoife', 'Seán', 'Niamh', 'Darragh', 'Ciara', 'Cian', 'Siobhán', 'Oisín', 'Agnieszka', 'Tomás'],
      surnames: ['Murphy', 'Kelly', 'O’Sullivan', 'Byrne', 'Walsh', 'Doyle', 'Kowalski', 'McCarthy', 'Adeyemi', 'Brennan'],
      market: 'the Moore Street market',
      neighbourhoods: ['Finglas', 'Tallaght', 'Ballymun', 'Crumlin'],
      transportJob: 'taxi driver',
      depot: 'the Dublin Port freight depot',
      money: { small: '€3,000', mid: '€22,000', large: '€150,000', huge: '€3.5 million' },
    },
    stateNoun: 'county',
    supranational: eu,
    districts: ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford'],
    policeService: () => 'An Garda Síochána',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District Court`;
      if (tier === 'state') return d === 'Dublin' ? 'Dublin Circuit Criminal Court' : `${d} Circuit Court`;
      if (tier === 'national') return 'the Supreme Court of Ireland';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Irish given names and surnames, including newer communities',
  },
  ES: {
    code: 'ES',
    name: 'Spain',
    localeTag: 'es-ES',
    currency: 'EUR',
    texture: {
      givenNames: ['Lucía', 'Javier', 'Carmen', 'Alejandro', 'Nerea', 'Pablo', 'Fátima', 'Sergio', 'Marta', 'Iker'],
      surnames: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Navarro', 'Torres', 'Ruiz', 'El Amrani'],
      market: 'the Mercado de Maravillas',
      neighbourhoods: ['Vallecas', 'Carabanchel', 'Usera', 'Tetuán'],
      transportJob: 'delivery driver',
      depot: 'the Mercamadrid freight depot',
      money: { small: '€2,500', mid: '€18,000', large: '€120,000', huge: '€3 million' },
    },
    stateNoun: 'provincia',
    supranational: eu,
    districts: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao'],
    policeService: (d) =>
      at({ Barcelona: 'Mossos d’Esquadra', Bilbao: 'Ertzaintza' }, d, 'Policía Nacional'),
    courtName: (tier, d) => {
      if (tier === 'district') return `Juzgado de lo Penal de ${d}`;
      if (tier === 'state') return `Audiencia Provincial de ${d === 'Bilbao' ? 'Bizkaia' : d}`;
      if (tier === 'national') return 'Tribunal Supremo';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Spanish given names and surnames, including Basque, Catalan and Moroccan-Spanish',
  },
  IT: {
    code: 'IT',
    name: 'Italy',
    localeTag: 'it-IT',
    currency: 'EUR',
    texture: {
      givenNames: ['Giulia', 'Marco', 'Francesca', 'Luca', 'Chiara', 'Alessandro', 'Sara', 'Giuseppe', 'Elena', 'Youssef'],
      surnames: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Popescu', 'Greco'],
      market: 'the Mercato Esquilino',
      neighbourhoods: ['Centocelle', 'Pigneto', 'Torpignattara', 'San Basilio'],
      transportJob: 'delivery driver',
      depot: 'the Roma Smistamento freight yard',
      money: { small: '€2,500', mid: '€18,000', large: '€130,000', huge: '€3 million' },
    },
    stateNoun: 'regione',
    supranational: eu,
    districts: ['Roma', 'Milano', 'Napoli', 'Torino', 'Palermo'],
    policeService: (d) => `Questura di ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunale di ${d}`;
      if (tier === 'state') return `Corte d’appello di ${d}`;
      if (tier === 'national') return 'Corte suprema di cassazione';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Italian given names and surnames, including newer communities',
  },
  PT: {
    code: 'PT',
    name: 'Portugal',
    localeTag: 'pt-PT',
    currency: 'EUR',
    texture: {
      givenNames: ['Inês', 'João', 'Mariana', 'Tiago', 'Ana', 'Rui', 'Beatriz', 'Diogo', 'Sofia', 'Edson'],
      surnames: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Tavares', 'Gomes', 'Lopes'],
      market: 'the Mercado da Ribeira',
      neighbourhoods: ['Marvila', 'Chelas', 'Arroios', 'Benfica'],
      transportJob: 'TVDE driver',
      depot: 'the Bobadela freight terminal',
      money: { small: '€2,000', mid: '€15,000', large: '€100,000', huge: '€2.5 million' },
    },
    stateNoun: 'distrito',
    supranational: eu,
    districts: ['Lisboa', 'Porto', 'Braga', 'Coimbra', 'Faro'],
    policeService: () => 'Polícia de Segurança Pública',
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal Judicial da Comarca de ${d}`;
      if (tier === 'state')
        return `Tribunal da Relação de ${at({ Braga: 'Guimarães', Faro: 'Évora' }, d, d)}`;
      if (tier === 'national') return 'Supremo Tribunal de Justiça';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Portuguese given names and surnames, including Cape Verdean and Brazilian Portuguese',
  },
  NL: {
    code: 'NL',
    name: 'the Netherlands',
    localeTag: 'nl-NL',
    currency: 'EUR',
    texture: {
      givenNames: ['Sanne', 'Daan', 'Fleur', 'Mohamed', 'Emma', 'Bram', 'Fatima', 'Ruben', 'Lotte', 'Kevin'],
      surnames: ['de Jong', 'Jansen', 'de Vries', 'Bakker', 'Yılmaz', 'Visser', 'El Idrissi', 'Smit', 'Meijer', 'Pinas'],
      market: 'the Albert Cuypmarkt',
      neighbourhoods: ['the Bijlmer', 'Slotervaart', 'Osdorp', 'Noord'],
      transportJob: 'delivery driver',
      depot: 'the Westpoort freight depot',
      money: { small: '€3,500', mid: '€25,000', large: '€170,000', huge: '€4 million' },
    },
    stateNoun: 'provincie',
    supranational: eu,
    districts: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven'],
    policeService: (d) =>
      `Politie eenheid ${at({ Utrecht: 'Midden-Nederland', Eindhoven: 'Oost-Brabant' }, d, d)}`,
    courtName: (tier, d) => {
      if (tier === 'district')
        return `Rechtbank ${at({ Utrecht: 'Midden-Nederland', Eindhoven: 'Oost-Brabant' }, d, d)}`;
      if (tier === 'state')
        return `Gerechtshof ${at(
          { Rotterdam: 'Den Haag', Utrecht: 'Arnhem-Leeuwarden', Eindhoven: '’s-Hertogenbosch' },
          d,
          d,
        )}`;
      if (tier === 'national') return 'Hoge Raad der Nederlanden';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Dutch given names and surnames, including Moroccan-, Turkish- and Surinamese-Dutch',
  },
  BE: {
    code: 'BE',
    name: 'Belgium',
    localeTag: 'nl-BE',
    currency: 'EUR',
    texture: {
      givenNames: ['Emma', 'Lucas', 'Louise', 'Mohamed', 'Julie', 'Arthur', 'Yasmine', 'Thibault', 'Elise', 'Jens'],
      surnames: ['Peeters', 'Janssens', 'Maes', 'Dubois', 'Lambert', 'Claes', 'El Amrani', 'Wouters', 'Lejeune', 'Mertens'],
      market: 'the Marché du Midi',
      neighbourhoods: ['Anderlecht', 'Schaerbeek', 'Saint-Gilles', 'Laeken'],
      transportJob: 'delivery driver',
      depot: 'the Port of Brussels freight depot',
      money: { small: '€3,500', mid: '€24,000', large: '€160,000', huge: '€3.8 million' },
    },
    stateNoun: 'province',
    supranational: eu,
    districts: ['Brussels', 'Antwerpen', 'Gent', 'Charleroi', 'Liège'],
    policeService: (d) =>
      at(
        {
          Brussels: 'Zone de police Bruxelles-Capitale Ixelles',
          Antwerpen: 'Politie Antwerpen',
          Gent: 'Politie Gent',
          Charleroi: 'Zone de police de Charleroi',
          Liège: 'Zone de police de Liège',
        },
        d,
        'Police fédérale',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Brussels: 'Tribunal de première instance francophone de Bruxelles',
            Antwerpen: 'Rechtbank van eerste aanleg Antwerpen',
            Gent: 'Rechtbank van eerste aanleg Oost-Vlaanderen',
            Charleroi: 'Tribunal de première instance du Hainaut',
            Liège: 'Tribunal de première instance de Liège',
          },
          d,
          'Tribunal de première instance francophone de Bruxelles',
        );
      if (tier === 'state')
        return at(
          {
            Brussels: 'Cour d’appel de Bruxelles',
            Antwerpen: 'Hof van beroep Antwerpen',
            Gent: 'Hof van beroep Gent',
            Charleroi: 'Cour d’appel de Mons',
            Liège: 'Cour d’appel de Liège',
          },
          d,
          'Cour d’appel de Bruxelles',
        );
      if (tier === 'national')
        return d === 'Antwerpen' || d === 'Gent' ? 'Hof van Cassatie' : 'Cour de cassation';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Belgian given names and surnames, Flemish, Walloon and Moroccan-Belgian',
  },
  SE: {
    code: 'SE',
    name: 'Sweden',
    localeTag: 'sv-SE',
    currency: 'SEK',
    texture: {
      givenNames: ['Elin', 'Oscar', 'Sara', 'Erik', 'Amira', 'Johan', 'Maja', 'Ahmed', 'Linnea', 'Anders'],
      surnames: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Hassan', 'Olsson', 'Persson', 'Lindqvist'],
      market: 'Hötorgshallen',
      neighbourhoods: ['Skärholmen', 'Farsta', 'Hägersten', 'Rinkeby'],
      transportJob: 'delivery driver',
      depot: 'the Årsta freight terminal',
      money: { small: 'SEK 40,000', mid: 'SEK 250,000', large: 'SEK 1.8 million', huge: 'SEK 40 million' },
    },
    stateNoun: 'län',
    supranational: eu,
    districts: ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås'],
    policeService: (d) =>
      `Polisregion ${at({ Stockholm: 'Stockholm', Göteborg: 'Väst', Malmö: 'Syd' }, d, 'Mitt')}`,
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          { Stockholm: 'Stockholms tingsrätt', Göteborg: 'Göteborgs tingsrätt', Västerås: 'Västmanlands tingsrätt' },
          d,
          `${d} tingsrätt`,
        );
      if (tier === 'state')
        return at(
          { Göteborg: 'Hovrätten för Västra Sverige', Malmö: 'Hovrätten över Skåne och Blekinge' },
          d,
          'Svea hovrätt',
        );
      if (tier === 'national') return 'Högsta domstolen';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Swedish given names and surnames, including newer communities',
  },
  DK: {
    code: 'DK',
    name: 'Denmark',
    localeTag: 'da-DK',
    currency: 'DKK',
    texture: {
      givenNames: ['Freja', 'Mads', 'Ida', 'Mikkel', 'Sofie', 'Rasmus', 'Mette', 'Ali', 'Camilla', 'Frederik'],
      surnames: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Kristiansen', 'Yıldız'],
      market: 'Torvehallerne',
      neighbourhoods: ['Nørrebro', 'Vesterbro', 'Valby', 'Amager'],
      transportJob: 'delivery driver',
      depot: 'the Nordhavn freight depot',
      money: { small: 'DKK 30,000', mid: 'DKK 180,000', large: 'DKK 1.3 million', huge: 'DKK 30 million' },
    },
    stateNoun: 'region',
    supranational: eu,
    districts: ['København', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg'],
    policeService: (d) =>
      at(
        {
          København: 'Københavns Politi',
          Aarhus: 'Østjyllands Politi',
          Odense: 'Fyns Politi',
          Aalborg: 'Nordjyllands Politi',
          Esbjerg: 'Syd- og Sønderjyllands Politi',
        },
        d,
        'Rigspolitiet',
      ),
    courtName: (tier, d) => {
      if (tier === 'district') return d === 'København' ? 'Københavns Byret' : `Retten i ${d}`;
      if (tier === 'state') return d === 'København' || d === 'Odense' ? 'Østre Landsret' : 'Vestre Landsret';
      if (tier === 'national') return 'Højesteret';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Danish given names and surnames, including newer communities',
  },
  FI: {
    code: 'FI',
    name: 'Finland',
    localeTag: 'fi-FI',
    currency: 'EUR',
    texture: {
      givenNames: ['Aino', 'Mikko', 'Emilia', 'Juha', 'Laura', 'Ville', 'Hanna', 'Antti', 'Sanna', 'Abdi'],
      surnames: ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Ahmed'],
      market: 'Hakaniemen kauppahalli',
      neighbourhoods: ['Kallio', 'Itäkeskus', 'Kontula', 'Vuosaari'],
      transportJob: 'delivery driver',
      depot: 'the Vuosaari harbour freight depot',
      money: { small: '€3,500', mid: '€24,000', large: '€160,000', huge: '€3.8 million' },
    },
    stateNoun: 'maakunta',
    supranational: eu,
    districts: ['Helsinki', 'Espoo', 'Tampere', 'Turku', 'Oulu'],
    policeService: (d) =>
      at(
        {
          Helsinki: 'Helsingin poliisilaitos',
          Espoo: 'Länsi-Uudenmaan poliisilaitos',
          Tampere: 'Sisä-Suomen poliisilaitos',
          Turku: 'Lounais-Suomen poliisilaitos',
          Oulu: 'Oulun poliisilaitos',
        },
        d,
        'Poliisi',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Helsinki: 'Helsingin käräjäoikeus',
            Espoo: 'Länsi-Uudenmaan käräjäoikeus',
            Tampere: 'Pirkanmaan käräjäoikeus',
            Turku: 'Varsinais-Suomen käräjäoikeus',
            Oulu: 'Oulun käräjäoikeus',
          },
          d,
          'Helsingin käräjäoikeus',
        );
      if (tier === 'state')
        return at(
          { Tampere: 'Turun hovioikeus', Turku: 'Turun hovioikeus', Oulu: 'Rovaniemen hovioikeus' },
          d,
          'Helsingin hovioikeus',
        );
      if (tier === 'national') return 'Korkein oikeus';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Finnish given names and surnames, including Finnish-Somali',
  },
  PL: {
    code: 'PL',
    name: 'Poland',
    localeTag: 'pl-PL',
    currency: 'PLN',
    texture: {
      givenNames: ['Anna', 'Piotr', 'Katarzyna', 'Tomasz', 'Magdalena', 'Krzysztof', 'Agnieszka', 'Paweł', 'Olena', 'Michał'],
      // Surnames that do not change with gender, so a woman is never "Kowalski".
      surnames: ['Nowak', 'Wójcik', 'Kowalczyk', 'Mazur', 'Krawczyk', 'Zając', 'Król', 'Wieczorek', 'Dudek', 'Kovalenko'],
      market: 'Hala Mirowska',
      neighbourhoods: ['Praga', 'Targówek', 'Wola', 'Bródno'],
      transportJob: 'delivery driver',
      depot: 'the Pruszków freight depot',
      money: { small: '15,000 zł', mid: '90,000 zł', large: '650,000 zł', huge: '15 million zł' },
    },
    stateNoun: 'województwo',
    supranational: eu,
    districts: ['Warszawa', 'Kraków', 'Łódź', 'Wrocław', 'Gdańsk'],
    policeService: (d) =>
      at(
        {
          Warszawa: 'Komenda Stołeczna Policji',
          Kraków: 'Komenda Miejska Policji w Krakowie',
          Łódź: 'Komenda Miejska Policji w Łodzi',
          Wrocław: 'Komenda Miejska Policji we Wrocławiu',
          Gdańsk: 'Komenda Miejska Policji w Gdańsku',
        },
        d,
        'Policja',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Warszawa: 'Sąd Rejonowy dla Warszawy-Śródmieścia',
            Kraków: 'Sąd Rejonowy dla Krakowa-Śródmieścia',
            Łódź: 'Sąd Rejonowy dla Łodzi-Śródmieścia',
            Wrocław: 'Sąd Rejonowy dla Wrocławia-Śródmieścia',
            Gdańsk: 'Sąd Rejonowy Gdańsk-Północ',
          },
          d,
          'Sąd Rejonowy dla Warszawy-Śródmieścia',
        );
      if (tier === 'state')
        return at(
          {
            Warszawa: 'Sąd Okręgowy w Warszawie',
            Kraków: 'Sąd Okręgowy w Krakowie',
            Łódź: 'Sąd Okręgowy w Łodzi',
            Wrocław: 'Sąd Okręgowy we Wrocławiu',
            Gdańsk: 'Sąd Okręgowy w Gdańsku',
          },
          d,
          'Sąd Okręgowy w Warszawie',
        );
      if (tier === 'national') return 'Sąd Najwyższy';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Polish given names and surnames, including Ukrainian-Polish',
  },
  AT: {
    code: 'AT',
    name: 'Austria',
    localeTag: 'de-AT',
    currency: 'EUR',
    texture: {
      givenNames: ['Anna', 'Lukas', 'Katharina', 'Florian', 'Elif', 'Stefan', 'Lisa', 'Dragan', 'Julia', 'Tobias'],
      surnames: ['Gruber', 'Huber', 'Wagner', 'Steiner', 'Moser', 'Hofer', 'Yıldırım', 'Pichler', 'Jovanović', 'Leitner'],
      market: 'the Naschmarkt',
      neighbourhoods: ['Favoriten', 'Simmering', 'Ottakring', 'Floridsdorf'],
      transportJob: 'delivery driver',
      depot: 'the Inzersdorf freight terminal',
      money: { small: '€3,500', mid: '€24,000', large: '€160,000', huge: '€3.8 million' },
    },
    stateNoun: 'Bundesland',
    supranational: eu,
    districts: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck'],
    policeService: (d) => (d === 'Wien' ? 'Landespolizeidirektion Wien' : `Stadtpolizeikommando ${d}`),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at({ Wien: 'Bezirksgericht Innere Stadt Wien', Graz: 'Bezirksgericht Graz-West' }, d, `Bezirksgericht ${d}`);
      if (tier === 'state')
        return d === 'Wien' || d === 'Graz' ? `Landesgericht für Strafsachen ${d}` : `Landesgericht ${d}`;
      if (tier === 'national') return 'Oberster Gerichtshof';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Austrian given names and surnames, including Turkish- and Balkan-Austrian',
  },
  CH: {
    code: 'CH',
    name: 'Switzerland',
    localeTag: 'de-CH',
    currency: 'CHF',
    texture: {
      givenNames: ['Lara', 'Luca', 'Noemi', 'Jonas', 'Céline', 'Nicolas', 'Elena', 'Arben', 'Laura', 'Reto'],
      surnames: ['Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Favre', 'Rossi', 'Berisha', 'Huber', 'Brunner'],
      market: 'the Bürkliplatz market',
      neighbourhoods: ['Altstetten', 'Schwamendingen', 'Oerlikon', 'Wiedikon'],
      transportJob: 'delivery driver',
      depot: 'the Limmattal freight depot',
      money: { small: 'CHF 5,000', mid: 'CHF 35,000', large: 'CHF 250,000', huge: 'CHF 6 million' },
    },
    stateNoun: 'Kanton',
    supranational: echr,
    districts: ['Zürich', 'Genève', 'Basel', 'Lausanne', 'Bern'],
    policeService: (d) =>
      at(
        {
          Zürich: 'Stadtpolizei Zürich',
          Genève: 'Police cantonale de Genève',
          Basel: 'Kantonspolizei Basel-Stadt',
          Lausanne: 'Police municipale de Lausanne',
          Bern: 'Kantonspolizei Bern',
        },
        d,
        'Kantonspolizei',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Zürich: 'Bezirksgericht Zürich',
            Genève: 'Tribunal de police de Genève',
            Basel: 'Strafgericht Basel-Stadt',
            Lausanne: 'Tribunal d’arrondissement de Lausanne',
            Bern: 'Regionalgericht Bern-Mittelland',
          },
          d,
          `Bezirksgericht ${d}`,
        );
      if (tier === 'state')
        return at(
          {
            Zürich: 'Obergericht des Kantons Zürich',
            Genève: 'Cour de justice de Genève',
            Basel: 'Appellationsgericht Basel-Stadt',
            Lausanne: 'Tribunal cantonal du canton de Vaud',
            Bern: 'Obergericht des Kantons Bern',
          },
          d,
          'Obergericht',
        );
      if (tier === 'national') return d === 'Genève' || d === 'Lausanne' ? 'Tribunal fédéral' : 'Bundesgericht';
      return ECHR;
    },
    nameRegister: 'Swiss given names and surnames across the language regions, including Kosovar-Swiss',
  },
  CZ: {
    code: 'CZ',
    name: 'Czechia',
    localeTag: 'cs-CZ',
    currency: 'CZK',
    texture: {
      givenNames: ['Tereza', 'Jakub', 'Lucie', 'Tomáš', 'Kateřina', 'Petr', 'Veronika', 'Martin', 'Eliška', 'Ondřej'],
      // Czech surnames mostly take -ová for women, and the cast draws one
      // surname list for everybody. These are the common ones that do not
      // change — soft adjectives, the -ů genitives, and Czech-Vietnamese.
      surnames: ['Krejčí', 'Kočí', 'Janů', 'Pavlů', 'Petrů', 'Matějů', 'Martinů', 'Nguyen', 'Pham', 'Tran'],
      market: 'the Havelské tržiště',
      neighbourhoods: ['Žižkov', 'Libeň', 'Vysočany', 'Smíchov'],
      transportJob: 'delivery driver',
      depot: 'the Praha-Uhříněves container terminal',
      money: { small: '80,000 Kč', mid: '500,000 Kč', large: '3.5 million Kč', huge: '80 million Kč' },
    },
    stateNoun: 'kraj',
    supranational: eu,
    districts: ['Praha', 'Brno', 'Ostrava', 'Plzeň', 'Liberec'],
    policeService: (d) =>
      at(
        {
          Praha: 'Krajské ředitelství policie hlavního města Prahy',
          Brno: 'Krajské ředitelství policie Jihomoravského kraje',
          Ostrava: 'Krajské ředitelství policie Moravskoslezského kraje',
          Plzeň: 'Krajské ředitelství policie Plzeňského kraje',
          Liberec: 'Krajské ředitelství policie Libereckého kraje',
        },
        d,
        'Policie České republiky',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Praha: 'Obvodní soud pro Prahu 1',
            Brno: 'Městský soud v Brně',
            Ostrava: 'Okresní soud v Ostravě',
            Plzeň: 'Okresní soud Plzeň-město',
            Liberec: 'Okresní soud v Liberci',
          },
          d,
          'Obvodní soud pro Prahu 1',
        );
      if (tier === 'state')
        return at(
          {
            Praha: 'Městský soud v Praze',
            Brno: 'Krajský soud v Brně',
            Ostrava: 'Krajský soud v Ostravě',
            Plzeň: 'Krajský soud v Plzni',
            Liberec: 'Krajský soud v Ústí nad Labem',
          },
          d,
          'Městský soud v Praze',
        );
      if (tier === 'national') return 'Nejvyšší soud';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Czech given names and surnames, including Czech-Vietnamese',
  },
  GR: {
    code: 'GR',
    name: 'Greece',
    localeTag: 'el-GR',
    currency: 'EUR',
    texture: {
      givenNames: ['Maria', 'Giorgos', 'Eleni', 'Dimitris', 'Katerina', 'Nikos', 'Sofia', 'Kostas', 'Despina', 'Yannis'],
      // The -ou surnames read the same for women and men.
      surnames: ['Georgiou', 'Ioannou', 'Nikolaou', 'Papaioannou', 'Konstantinou', 'Dimitriou', 'Christou', 'Antoniou', 'Pavlou', 'Vasileiou'],
      market: 'the Varvakios Agora',
      neighbourhoods: ['Kypseli', 'Peristeri', 'Egaleo', 'Patissia'],
      transportJob: 'taxi driver',
      depot: 'the Thriasio freight centre',
      money: { small: '€2,000', mid: '€15,000', large: '€100,000', huge: '€2.5 million' },
    },
    stateNoun: 'region',
    supranational: eu,
    districts: ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa'],
    policeService: () => 'Hellenic Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Court of First Instance`;
      if (tier === 'state') return d === 'Heraklion' ? 'the Court of Appeal of Eastern Crete' : `${d} Court of Appeal`;
      if (tier === 'national') return 'the Areios Pagos';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Greek given names and surnames',
  },
  RO: {
    code: 'RO',
    name: 'Romania',
    localeTag: 'ro-RO',
    currency: 'RON',
    texture: {
      givenNames: ['Andreea', 'Andrei', 'Ioana', 'Mihai', 'Elena', 'Alexandru', 'Cristina', 'Gabriel', 'Roxana', 'Florin'],
      surnames: ['Popescu', 'Ionescu', 'Popa', 'Dumitru', 'Stan', 'Stoica', 'Gheorghe', 'Rusu', 'Munteanu', 'Kovács'],
      market: 'Piața Obor',
      neighbourhoods: ['Rahova', 'Pantelimon', 'Berceni', 'Titan'],
      transportJob: 'delivery driver',
      depot: 'the Chitila freight depot',
      money: { small: '15,000 lei', mid: '100,000 lei', large: '700,000 lei', huge: '15 million lei' },
    },
    stateNoun: 'județ',
    supranational: eu,
    districts: ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța'],
    policeService: (d) =>
      at(
        {
          București: 'Direcția Generală de Poliție a Municipiului București',
          'Cluj-Napoca': 'Inspectoratul de Poliție Județean Cluj',
          Timișoara: 'Inspectoratul de Poliție Județean Timiș',
          Iași: 'Inspectoratul de Poliție Județean Iași',
          Constanța: 'Inspectoratul de Poliție Județean Constanța',
        },
        d,
        'Poliția Română',
      ),
    courtName: (tier, d) => {
      if (tier === 'district') return d === 'București' ? 'Judecătoria Sectorului 1 București' : `Judecătoria ${d}`;
      if (tier === 'state')
        return `Tribunalul ${at({ 'Cluj-Napoca': 'Cluj', Timișoara: 'Timiș' }, d, d)}`;
      if (tier === 'national') return 'Înalta Curte de Casație și Justiție';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Romanian given names and surnames, including Hungarian-Romanian',
  },
  HU: {
    code: 'HU',
    name: 'Hungary',
    localeTag: 'hu-HU',
    currency: 'HUF',
    texture: {
      givenNames: ['Anna', 'Bence', 'Eszter', 'Balázs', 'Réka', 'Gábor', 'Zsófia', 'László', 'Katalin', 'Dávid'],
      surnames: ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Farkas', 'Balogh'],
      market: 'the Nagycsarnok',
      neighbourhoods: ['Kőbánya', 'Újpest', 'Csepel', 'Józsefváros'],
      transportJob: 'delivery driver',
      depot: 'the Soroksár freight terminal',
      money: { small: '1,200,000 Ft', mid: '8,000,000 Ft', large: '55 million Ft', huge: '1.2 billion Ft' },
    },
    stateNoun: 'vármegye',
    supranational: eu,
    districts: ['Budapest', 'Debrecen', 'Szeged', 'Miskolc', 'Pécs'],
    policeService: (d) =>
      at(
        {
          Budapest: 'Budapesti Rendőr-főkapitányság',
          Debrecen: 'Hajdú-Bihar Vármegyei Rendőr-főkapitányság',
          Szeged: 'Csongrád-Csanád Vármegyei Rendőr-főkapitányság',
          Miskolc: 'Borsod-Abaúj-Zemplén Vármegyei Rendőr-főkapitányság',
          Pécs: 'Baranya Vármegyei Rendőr-főkapitányság',
        },
        d,
        'Rendőrség',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Budapest: 'Pesti Központi Kerületi Bíróság',
            Debrecen: 'Debreceni Járásbíróság',
            Szeged: 'Szegedi Járásbíróság',
            Miskolc: 'Miskolci Járásbíróság',
            Pécs: 'Pécsi Járásbíróság',
          },
          d,
          'Pesti Központi Kerületi Bíróság',
        );
      if (tier === 'state')
        return at(
          {
            Budapest: 'Fővárosi Törvényszék',
            Debrecen: 'Debreceni Törvényszék',
            Szeged: 'Szegedi Törvényszék',
            Miskolc: 'Miskolci Törvényszék',
            Pécs: 'Pécsi Törvényszék',
          },
          d,
          'Fővárosi Törvényszék',
        );
      if (tier === 'national') return 'Kúria';
      if (tier === 'supranational') return CJEU;
      return ECHR;
    },
    nameRegister: 'Hungarian given names and surnames, written given-name first',
  },
  TR: {
    code: 'TR',
    name: 'Türkiye',
    localeTag: 'tr-TR',
    currency: 'TRY',
    texture: {
      givenNames: ['Zeynep', 'Mehmet', 'Elif', 'Mustafa', 'Ayşe', 'Emre', 'Rojda', 'Burak', 'Merve', 'Baran'],
      surnames: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan'],
      market: 'the Kapalıçarşı',
      neighbourhoods: ['Bağcılar', 'Esenyurt', 'Zeytinburnu', 'Gaziosmanpaşa'],
      transportJob: 'dolmuş driver',
      depot: 'the Halkalı freight depot',
      money: { small: '₺150,000', mid: '₺1,000,000', large: '₺7.5 million', huge: '₺150 million' },
    },
    stateNoun: 'il',
    supranational: echr,
    districts: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya'],
    policeService: (d) => `${d} Emniyet Müdürlüğü`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Asliye Ceza Mahkemesi`;
      if (tier === 'state') return `${d} Bölge Adliye Mahkemesi`;
      if (tier === 'national') return 'Yargıtay';
      return ECHR;
    },
    nameRegister: 'Turkish given names and surnames, including Kurdish',
  },
  IL: {
    code: 'IL',
    name: 'Israel',
    localeTag: 'he-IL',
    currency: 'ILS',
    texture: {
      givenNames: ['Noa', 'Yosef', 'Tamar', 'Avi', 'Shira', 'Ahmad', 'Rania', 'Itai', 'Yael', 'Daniel'],
      surnames: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Friedman', 'Khoury', 'Azoulay', 'Mansour', 'Goldberg'],
      market: 'the Carmel Market',
      neighbourhoods: ['Jaffa', 'Hatikva', 'Shapira', 'Kiryat Shalom'],
      transportJob: 'sherut driver',
      depot: 'the Holon industrial zone depot',
      money: { small: '₪15,000', mid: '₪90,000', large: '₪650,000', huge: '₪15 million' },
    },
    stateNoun: 'district',
    supranational: null,
    districts: ['Tel Aviv', 'Haifa', 'Be’er Sheva', 'Rishon LeZion', 'Netanya'],
    policeService: () => 'Israel Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates’ Court`;
      if (tier === 'state')
        return at(
          { 'Tel Aviv': 'Tel Aviv District Court', Haifa: 'Haifa District Court', 'Be’er Sheva': 'Be’er Sheva District Court' },
          d,
          'Central District Court',
        );
      if (tier === 'national') return 'the Supreme Court of Israel';
      return ICJ;
    },
    nameRegister: 'Israeli given names and surnames, Jewish and Arab',
  },
  AE: {
    code: 'AE',
    name: 'the United Arab Emirates',
    localeTag: 'ar-AE',
    currency: 'AED',
    texture: {
      givenNames: ['Mariam', 'Ahmed', 'Fatima', 'Rashid', 'Maricel', 'Khalid', 'Priya', 'Omar', 'Noura', 'Rajesh'],
      surnames: ['Al Mansouri', 'Al Hashimi', 'Al Nuaimi', 'Khan', 'Menon', 'Santos', 'Haddad', 'Al Suwaidi', 'Nair', 'Hussain'],
      market: 'the Waterfront Market in Deira',
      neighbourhoods: ['Deira', 'Karama', 'Al Quoz', 'Satwa'],
      transportJob: 'taxi driver',
      depot: 'the Jebel Ali freight depot',
      money: { small: 'AED 20,000', mid: 'AED 150,000', large: 'AED 1 million', huge: 'AED 25 million' },
    },
    stateNoun: 'emirate',
    supranational: null,
    districts: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'],
    policeService: (d) => `${d} Police`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Court of First Instance`;
      if (tier === 'state') return `${d} Court of Appeal`;
      if (tier === 'national') return 'the Federal Supreme Court';
      return ICJ;
    },
    nameRegister: 'names of the UAE’s real population — Emirati, Arab, South Asian and Filipino',
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    localeTag: 'ar-SA',
    currency: 'SAR',
    texture: {
      givenNames: ['Noura', 'Abdullah', 'Sara', 'Faisal', 'Reem', 'Mohammed', 'Hessa', 'Saad', 'Lama', 'Turki'],
      surnames: ['Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Harbi', 'Al-Zahrani', 'Al-Shehri', 'Al-Dosari', 'Al-Mutairi', 'Al-Anazi', 'Al-Shammari'],
      market: 'Souq Al-Zal',
      neighbourhoods: ['Al Batha', 'Al Naseem', 'Al Suwaidi', 'Al Shifa'],
      transportJob: 'delivery driver',
      depot: 'the Riyadh Dry Port',
      money: { small: 'SAR 20,000', mid: 'SAR 150,000', large: 'SAR 1 million', huge: 'SAR 25 million' },
    },
    stateNoun: 'region',
    supranational: null,
    districts: ['Riyadh', 'Jeddah', 'Dammam', 'Taif', 'Tabuk'],
    policeService: (d) =>
      at(
        { Riyadh: 'Riyadh Region Police', Dammam: 'Eastern Province Police', Tabuk: 'Tabuk Region Police' },
        d,
        'Makkah Region Police',
      ),
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Criminal Court`;
      if (tier === 'state')
        return at(
          { Riyadh: 'Riyadh Court of Appeal', Dammam: 'Eastern Province Court of Appeal', Tabuk: 'Tabuk Court of Appeal' },
          d,
          'Makkah Court of Appeal',
        );
      if (tier === 'national') return 'the Supreme Court of Saudi Arabia';
      return ICJ;
    },
    nameRegister: 'Saudi given names and family names',
  },
  EG: {
    code: 'EG',
    name: 'Egypt',
    localeTag: 'ar-EG',
    currency: 'EGP',
    texture: {
      givenNames: ['Mariam', 'Ahmed', 'Yasmin', 'Mahmoud', 'Heba', 'Mostafa', 'Salma', 'Karim', 'Marina', 'Mina'],
      surnames: ['Hassan', 'Ibrahim', 'El-Sayed', 'Mansour', 'Fathy', 'Soliman', 'Girgis', 'Farouk', 'Naguib', 'Shenouda'],
      market: 'Khan el-Khalili',
      neighbourhoods: ['Shubra', 'Boulaq', 'Sayeda Zeinab', 'Ain Shams'],
      transportJob: 'microbus driver',
      depot: 'the Ramses rail freight depot',
      money: { small: 'EGP 150,000', mid: 'EGP 1 million', large: 'EGP 7.5 million', huge: 'EGP 150 million' },
    },
    stateNoun: 'governorate',
    supranational: au,
    districts: ['Cairo', 'Alexandria', 'Giza', 'Port Said', 'Mansoura'],
    policeService: (d) => `${d === 'Mansoura' ? 'Dakahlia' : d} Security Directorate`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Misdemeanours Court`;
      if (tier === 'state') return `${d} Criminal Court`;
      if (tier === 'national') return 'the Court of Cassation';
      if (tier === 'supranational') return ACHPR;
      return ICJ;
    },
    nameRegister: 'Egyptian given names and surnames, Muslim and Coptic',
  },
  MA: {
    code: 'MA',
    name: 'Morocco',
    localeTag: 'ar-MA',
    currency: 'MAD',
    texture: {
      givenNames: ['Khadija', 'Youssef', 'Imane', 'Hamza', 'Salma', 'Mehdi', 'Meryem', 'Ayoub', 'Nadia', 'Amine'],
      surnames: ['Alaoui', 'Bennani', 'Tazi', 'El Amrani', 'Berrada', 'Chraibi', 'Ait Said', 'Ouazzani', 'Lahlou', 'Benjelloun'],
      market: 'the Marché Central',
      neighbourhoods: ['Hay Mohammadi', 'Sidi Moumen', 'Derb Sultan', 'Ben M’Sick'],
      transportJob: 'grand taxi driver',
      depot: 'the Casablanca port freight depot',
      money: { small: '30,000 DH', mid: '200,000 DH', large: '1.5 million DH', huge: '30 million DH' },
    },
    stateNoun: 'région',
    supranational: au,
    districts: ['Casablanca', 'Rabat', 'Fès', 'Marrakech', 'Tanger'],
    policeService: (d) => `Préfecture de police de ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal de première instance de ${d}`;
      if (tier === 'state') return `Cour d’appel de ${d}`;
      if (tier === 'national') return 'Cour de cassation';
      if (tier === 'supranational') return ACHPR;
      return ICJ;
    },
    nameRegister: 'Moroccan given names and surnames, Arab and Amazigh',
  },
  PK: {
    code: 'PK',
    name: 'Pakistan',
    localeTag: 'en-PK',
    currency: 'PKR',
    texture: {
      givenNames: ['Ayesha', 'Ali', 'Sana', 'Bilal', 'Hina', 'Usman', 'Mehwish', 'Hamza', 'Rabia', 'Asif'],
      surnames: ['Khan', 'Ahmed', 'Malik', 'Qureshi', 'Butt', 'Chaudhry', 'Siddiqui', 'Shah', 'Baloch', 'Masih'],
      market: 'Empress Market',
      neighbourhoods: ['Lyari', 'Orangi Town', 'Korangi', 'Saddar'],
      transportJob: 'rickshaw driver',
      depot: 'the Keamari goods depot',
      money: { small: 'Rs 5 lakh', mid: 'Rs 30 lakh', large: 'Rs 2.5 crore', huge: 'Rs 50 crore' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Peshawar'],
    policeService: (d) => at({ Karachi: 'Sindh Police', Peshawar: 'Khyber Pakhtunkhwa Police' }, d, 'Punjab Police'),
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District and Sessions Court`;
      if (tier === 'state') return at({ Karachi: 'the Sindh High Court', Peshawar: 'the Peshawar High Court' }, d, 'the Lahore High Court');
      if (tier === 'national') return 'the Supreme Court of Pakistan';
      return ICJ;
    },
    nameRegister: 'Pakistani given names and surnames across provinces and communities',
  },
  BD: {
    code: 'BD',
    name: 'Bangladesh',
    localeTag: 'bn-BD',
    currency: 'BDT',
    texture: {
      givenNames: ['Nusrat', 'Rahim', 'Farhana', 'Tanvir', 'Sumaiya', 'Rafiq', 'Tahmina', 'Arif', 'Anjali', 'Rajib'],
      surnames: ['Hossain', 'Rahman', 'Islam', 'Chowdhury', 'Sarkar', 'Das', 'Talukder', 'Haque', 'Khan', 'Biswas'],
      market: 'Kawran Bazar',
      neighbourhoods: ['Mirpur', 'Jatrabari', 'Mohammadpur', 'Lalbagh'],
      transportJob: 'CNG auto-rickshaw driver',
      depot: 'the Kamalapur inland container depot',
      money: { small: '৳3 lakh', mid: '৳20 lakh', large: '৳1.5 crore', huge: '৳30 crore' },
    },
    stateNoun: 'division',
    supranational: null,
    districts: ['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Sylhet'],
    policeService: (d) => `${d} Metropolitan Police`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Chief Metropolitan Magistrate’s Court`;
      if (tier === 'state') return `${d} Metropolitan Sessions Judge’s Court`;
      if (tier === 'national') return 'the Supreme Court of Bangladesh';
      return ICJ;
    },
    nameRegister: 'Bangladeshi given names and surnames, Muslim and Hindu',
  },
  LK: {
    code: 'LK',
    name: 'Sri Lanka',
    localeTag: 'si-LK',
    currency: 'LKR',
    texture: {
      givenNames: ['Nimali', 'Kasun', 'Tharushi', 'Chaminda', 'Fathima', 'Suresh', 'Kavitha', 'Mohamed', 'Dilani', 'Kumaran'],
      surnames: ['Perera', 'Fernando', 'de Silva', 'Jayasinghe', 'Bandara', 'Herath', 'Sivakumar', 'Marikar', 'Gunawardena', 'Rathnayake'],
      market: 'the Pettah market',
      neighbourhoods: ['Maradana', 'Dematagoda', 'Kotahena', 'Wellawatte'],
      transportJob: 'tuk-tuk driver',
      depot: 'the Peliyagoda goods depot',
      money: { small: 'Rs. 500,000', mid: 'Rs. 3 million', large: 'Rs. 25 million', huge: 'Rs. 500 million' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Colombo', 'Kandy', 'Galle', 'Jaffna', 'Negombo'],
    policeService: () => 'Sri Lanka Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate’s Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Supreme Court of Sri Lanka';
      return ICJ;
    },
    nameRegister: 'Sri Lankan given names and surnames — Sinhala, Tamil and Muslim',
  },
  ID: {
    code: 'ID',
    name: 'Indonesia',
    localeTag: 'id-ID',
    currency: 'IDR',
    texture: {
      givenNames: ['Siti', 'Budi', 'Dewi', 'Agus', 'Putri', 'Rizky', 'Ayu', 'Hendra', 'Fitri', 'Yohanes'],
      surnames: ['Santoso', 'Wijaya', 'Siregar', 'Nasution', 'Saputra', 'Hidayat', 'Susanto', 'Simanjuntak', 'Kurniawan', 'Halim'],
      market: 'Pasar Tanah Abang',
      neighbourhoods: ['Tanjung Priok', 'Cengkareng', 'Kampung Melayu', 'Cakung'],
      transportJob: 'ojek driver',
      depot: 'the Cikarang dry port',
      money: { small: 'Rp 50 million', mid: 'Rp 350 million', large: 'Rp 2.5 billion', huge: 'Rp 50 billion' },
    },
    stateNoun: 'provinsi',
    supranational: null,
    districts: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar'],
    policeService: (d) => (d === 'Jakarta' ? 'Polda Metro Jaya' : `Polrestabes ${d}`),
    courtName: (tier, d) => {
      if (tier === 'district') return d === 'Jakarta' ? 'Pengadilan Negeri Jakarta Pusat' : `Pengadilan Negeri ${d}`;
      if (tier === 'state') return d === 'Jakarta' ? 'Pengadilan Tinggi DKI Jakarta' : `Pengadilan Tinggi ${d}`;
      if (tier === 'national') return 'Mahkamah Agung';
      return ICJ;
    },
    nameRegister: 'Indonesian given names and family names across islands and communities',
  },
  MY: {
    code: 'MY',
    name: 'Malaysia',
    localeTag: 'ms-MY',
    currency: 'MYR',
    texture: {
      givenNames: ['Nurul', 'Hafiz', 'Mei Ling', 'Jason', 'Kavitha', 'Arif', 'Aisyah', 'Rajesh', 'Siti', 'Kumar'],
      surnames: ['Ismail', 'Tan', 'Lim', 'Abdullah', 'Wong', 'Rahman', 'Subramaniam', 'Lee', 'Othman', 'Chong'],
      market: 'the Chow Kit market',
      neighbourhoods: ['Kampung Baru', 'Cheras', 'Sentul', 'Setapak'],
      transportJob: 'e-hailing driver',
      depot: 'the Port Klang freight depot',
      money: { small: 'RM 15,000', mid: 'RM 100,000', large: 'RM 700,000', huge: 'RM 15 million' },
    },
    stateNoun: 'state',
    supranational: null,
    districts: ['Kuala Lumpur', 'George Town', 'Johor Bahru', 'Ipoh', 'Kota Kinabalu'],
    policeService: () => 'Royal Malaysia Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates’ Court`;
      if (tier === 'state') return d === 'George Town' ? 'Penang High Court' : `${d} High Court`;
      if (tier === 'national') return 'the Federal Court of Malaysia';
      return ICJ;
    },
    nameRegister: 'Malaysian given names and surnames — Malay, Chinese, Indian and Bornean',
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    localeTag: 'en-SG',
    currency: 'SGD',
    texture: {
      givenNames: ['Rachel', 'Marcus', 'Nurul', 'Farid', 'Priya', 'Ravi', 'Jasmine', 'Darren', 'Aisyah', 'Kelvin'],
      surnames: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Chua', 'Rahman', 'Pillai', 'Hassan'],
      market: 'the Tampines Round Market',
      neighbourhoods: ['Tampines West', 'Tampines East', 'Tampines North', 'Simei'],
      transportJob: 'private-hire driver',
      depot: 'the Pasir Panjang freight terminal',
      money: { small: '$5,000', mid: '$35,000', large: '$250,000', huge: '$6 million' },
    },
    stateNoun: 'region',
    supranational: null,
    // A city-state: the districts are its most populous planning areas.
    districts: ['Tampines', 'Bedok', 'Jurong West', 'Woodlands', 'Ang Mo Kio'],
    policeService: () => 'Singapore Police Force',
    courtName: (tier) => {
      if (tier === 'district') return 'the State Courts';
      if (tier === 'state') return 'the High Court of Singapore';
      if (tier === 'national') return 'the Court of Appeal of Singapore';
      return ICJ;
    },
    nameRegister: 'Singaporean given names and surnames — Chinese, Malay and Indian',
  },
  PH: {
    code: 'PH',
    name: 'the Philippines',
    localeTag: 'en-PH',
    currency: 'PHP',
    texture: {
      givenNames: ['Maria', 'Juan', 'Angelica', 'Mark', 'Kristine', 'Jerome', 'Rowena', 'Rodel', 'Maricel', 'Carlo'],
      surnames: ['Santos', 'Reyes', 'Dela Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Villanueva', 'Ramos', 'Castillo', 'Tan'],
      market: 'Divisoria market',
      neighbourhoods: ['Tondo', 'Sampaloc', 'Santa Ana', 'Paco'],
      transportJob: 'jeepney driver',
      depot: 'the Manila North Harbor freight depot',
      money: { small: '₱150,000', mid: '₱1,000,000', large: '₱7.5 million', huge: '₱150 million' },
    },
    stateNoun: 'region',
    supranational: null,
    districts: ['Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Caloocan'],
    policeService: (d) =>
      at(
        {
          Manila: 'Manila Police District',
          'Quezon City': 'Quezon City Police District',
          'Cebu City': 'Cebu City Police Office',
          'Davao City': 'Davao City Police Office',
          Caloocan: 'Caloocan City Police Station',
        },
        d,
        'Philippine National Police',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return d === 'Cebu City' || d === 'Davao City'
          ? `Municipal Trial Court in Cities, ${d}`
          : `Metropolitan Trial Court of ${d}`;
      if (tier === 'state') return `Regional Trial Court of ${d}`;
      if (tier === 'national') return 'the Supreme Court of the Philippines';
      return ICJ;
    },
    nameRegister: 'Filipino given names and surnames',
  },
  TH: {
    code: 'TH',
    name: 'Thailand',
    localeTag: 'th-TH',
    currency: 'THB',
    texture: {
      givenNames: ['Siriporn', 'Somchai', 'Kanya', 'Nattapong', 'Pimchanok', 'Anan', 'Ratana', 'Wichai', 'Malee', 'Thanawat'],
      surnames: ['Saetang', 'Saelim', 'Srisuk', 'Kaewkla', 'Boonyarit', 'Thongdee', 'Jaidee', 'Rattanakorn', 'Sukprasert', 'Wongsawat'],
      market: 'the Chatuchak Weekend Market',
      neighbourhoods: ['Khlong Toei', 'Bang Kapi', 'Din Daeng', 'Lat Phrao'],
      transportJob: 'tuk-tuk driver',
      depot: 'the Lat Krabang inland container depot',
      money: { small: '฿150,000', mid: '฿1,000,000', large: '฿7.5 million', huge: '฿150 million' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Bangkok', 'Chiang Mai', 'Nakhon Ratchasima', 'Khon Kaen', 'Udon Thani'],
    policeService: (d) => (d === 'Bangkok' ? 'Metropolitan Police Bureau' : 'Royal Thai Police'),
    courtName: (tier, d) => {
      if (tier === 'district') return d === 'Bangkok' ? 'the Criminal Court' : `${d} Provincial Court`;
      if (tier === 'state')
        return at(
          {
            'Chiang Mai': 'Court of Appeal Region 5',
            'Nakhon Ratchasima': 'Court of Appeal Region 3',
            'Khon Kaen': 'Court of Appeal Region 4',
            'Udon Thani': 'Court of Appeal Region 4',
          },
          d,
          'the Court of Appeal',
        );
      if (tier === 'national') return 'the Supreme Court of Thailand';
      return ICJ;
    },
    nameRegister: 'Thai given names and surnames',
  },
  VN: {
    code: 'VN',
    name: 'Vietnam',
    localeTag: 'vi-VN',
    currency: 'VND',
    texture: {
      givenNames: ['Lan', 'Tuấn', 'Hương', 'Hùng', 'Mai', 'Dũng', 'Trang', 'Quang', 'Thảo', 'Phúc'],
      surnames: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'],
      market: 'Bến Thành Market',
      neighbourhoods: ['Gò Vấp', 'Bình Thạnh', 'Tân Bình', 'Thủ Đức'],
      transportJob: 'xe ôm driver',
      depot: 'the Cát Lái container depot',
      money: { small: '100 million đồng', mid: '700 million đồng', large: '5 billion đồng', huge: '100 billion đồng' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Ho Chi Minh City', 'Hanoi', 'Haiphong', 'Da Nang', 'Can Tho'],
    policeService: (d) => `${d} Police`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Regional People’s Court`;
      if (tier === 'state') return `${d} People’s Court`;
      if (tier === 'national') return 'the Supreme People’s Court';
      return ICJ;
    },
    nameRegister: 'Vietnamese given names and family names',
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    localeTag: 'ja-JP',
    currency: 'JPY',
    texture: {
      givenNames: ['Sakura', 'Haruto', 'Yui', 'Takumi', 'Misaki', 'Kenji', 'Hina', 'Daiki', 'Emi', 'Sota'],
      surnames: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Higa'],
      market: 'Ameyoko market',
      neighbourhoods: ['Adachi', 'Katsushika', 'Edogawa', 'Ōta'],
      transportJob: 'delivery driver',
      depot: 'the Tokyo Freight Terminal',
      money: { small: '¥500,000', mid: '¥3.5 million', large: '¥25 million', huge: '¥500 million' },
    },
    stateNoun: 'prefecture',
    supranational: null,
    districts: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Fukuoka'],
    policeService: (d) =>
      at(
        {
          Tokyo: 'Tokyo Metropolitan Police Department',
          Osaka: 'Osaka Prefectural Police',
          Yokohama: 'Kanagawa Prefectural Police',
          Nagoya: 'Aichi Prefectural Police',
          Fukuoka: 'Fukuoka Prefectural Police',
        },
        d,
        'National Police Agency',
      ),
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District Court`;
      if (tier === 'state') return `${at({ Yokohama: 'Tokyo' }, d, d)} High Court`;
      if (tier === 'national') return 'the Supreme Court of Japan';
      return ICJ;
    },
    nameRegister: 'Japanese given names and surnames',
  },
  KR: {
    code: 'KR',
    name: 'South Korea',
    localeTag: 'ko-KR',
    currency: 'KRW',
    texture: {
      givenNames: ['Seo-yeon', 'Min-jun', 'Ha-eun', 'Do-yun', 'Ye-jin', 'Hyun-woo', 'Eun-ji', 'Jae-hyun', 'Min-seo', 'Seo-jun'],
      surnames: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim'],
      market: 'Namdaemun Market',
      neighbourhoods: ['Guro', 'Geumcheon', 'Dobong', 'Jungnang'],
      transportJob: 'delivery rider',
      depot: 'the Uiwang inland container depot',
      money: { small: '₩5 million', mid: '₩35 million', large: '₩250 million', huge: '₩5 billion' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon'],
    policeService: (d) => `${d} Metropolitan Police Agency`,
    courtName: (tier, d) => {
      if (tier === 'district') return d === 'Seoul' ? 'Seoul Central District Court' : `${d} District Court`;
      if (tier === 'state') return `${at({ Incheon: 'Seoul' }, d, d)} High Court`;
      if (tier === 'national') return 'the Supreme Court of Korea';
      return ICJ;
    },
    nameRegister: 'Korean given names and surnames',
  },
  CN: {
    code: 'CN',
    name: 'China',
    localeTag: 'zh-CN',
    currency: 'CNY',
    texture: {
      givenNames: ['Xiaomei', 'Haoran', 'Yuting', 'Zihao', 'Xinyi', 'Junjie', 'Meiling', 'Jianguo', 'Lili', 'Qiang'],
      surnames: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou'],
      market: 'the Qipu Road market',
      neighbourhoods: ['Yangpu', 'Baoshan', 'Putuo', 'Minhang'],
      transportJob: 'delivery rider',
      depot: 'the Waigaoqiao freight depot',
      money: { small: '¥30,000', mid: '¥200,000', large: '¥1.5 million', huge: '¥30 million' },
    },
    stateNoun: 'province',
    supranational: null,
    districts: ['Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen', 'Chengdu'],
    policeService: (d) => `${d} Municipal Public Security Bureau`,
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Shanghai: 'Shanghai Huangpu District People’s Court',
            Beijing: 'Beijing Chaoyang District People’s Court',
            Guangzhou: 'Guangzhou Tianhe District People’s Court',
            Shenzhen: 'Shenzhen Futian District People’s Court',
            Chengdu: 'Chengdu Wuhou District People’s Court',
          },
          d,
          `${d} People’s Court`,
        );
      if (tier === 'state')
        return `${at({ Guangzhou: 'Guangdong', Shenzhen: 'Guangdong', Chengdu: 'Sichuan' }, d, d)} High People’s Court`;
      if (tier === 'national') return 'the Supreme People’s Court';
      return ICJ;
    },
    nameRegister: 'Chinese given names and surnames, written given-name first',
  },
  MX: {
    code: 'MX',
    name: 'Mexico',
    localeTag: 'es-MX',
    currency: 'MXN',
    texture: {
      givenNames: ['Ximena', 'José', 'Fernanda', 'Miguel', 'Daniela', 'Jesús', 'Valeria', 'Alejandro', 'Guadalupe', 'Eduardo'],
      surnames: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz'],
      market: 'the Mercado de la Merced',
      neighbourhoods: ['Iztapalapa', 'Tepito', 'Doctores', 'Azcapotzalco'],
      transportJob: 'pesero driver',
      depot: 'the Pantaco freight terminal',
      money: { small: '$60,000', mid: '$400,000', large: '$3 million', huge: '$60 million' },
    },
    stateNoun: 'estado',
    supranational: iachr,
    districts: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana'],
    policeService: (d) =>
      d === 'Ciudad de México' ? 'Secretaría de Seguridad Ciudadana de la Ciudad de México' : `Policía Municipal de ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Juzgado de Control de ${d}`;
      if (tier === 'state')
        return `Tribunal Superior de Justicia ${at(
          {
            'Ciudad de México': 'de la Ciudad de México',
            Guadalajara: 'del Estado de Jalisco',
            Monterrey: 'del Estado de Nuevo León',
            Puebla: 'del Estado de Puebla',
            Tijuana: 'del Estado de Baja California',
          },
          d,
          `de ${d}`,
        )}`;
      if (tier === 'national') return 'Suprema Corte de Justicia de la Nación';
      return CIDH;
    },
    nameRegister: 'Mexican given names and surnames',
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    localeTag: 'es-AR',
    currency: 'ARS',
    texture: {
      givenNames: ['Sofía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Joaquín', 'Lucía', 'Facundo', 'Florencia', 'Martín'],
      surnames: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sosa'],
      market: 'the Mercado Central de Buenos Aires',
      neighbourhoods: ['La Boca', 'Barracas', 'Constitución', 'Mataderos'],
      transportJob: 'colectivo driver',
      depot: 'the Dock Sud freight depot',
      money: { small: '$4 million', mid: '$25 million', large: '$180 million', huge: '$4 billion' },
    },
    stateNoun: 'provincia',
    supranational: iachr,
    districts: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata'],
    policeService: (d) =>
      at(
        {
          'Buenos Aires': 'Policía de la Ciudad',
          Córdoba: 'Policía de la Provincia de Córdoba',
          Rosario: 'Policía de la Provincia de Santa Fe',
          Mendoza: 'Policía de Mendoza',
          'La Plata': 'Policía de la Provincia de Buenos Aires',
        },
        d,
        'Policía Federal Argentina',
      ),
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            'Buenos Aires': 'Juzgado Nacional en lo Criminal y Correccional',
            Córdoba: 'Juzgado de Control de Córdoba',
            Rosario: 'Colegio de Jueces Penales de Rosario',
            Mendoza: 'Juzgado Penal Colegiado de Mendoza',
            'La Plata': 'Juzgado de Garantías de La Plata',
          },
          d,
          'Juzgado Nacional en lo Criminal y Correccional',
        );
      if (tier === 'state')
        return at(
          {
            'Buenos Aires': 'Cámara Nacional de Apelaciones en lo Criminal y Correccional',
            Córdoba: 'Tribunal Superior de Justicia de Córdoba',
            Rosario: 'Corte Suprema de Justicia de Santa Fe',
            Mendoza: 'Suprema Corte de Justicia de Mendoza',
            'La Plata': 'Suprema Corte de Justicia de la Provincia de Buenos Aires',
          },
          d,
          'Cámara Nacional de Apelaciones en lo Criminal y Correccional',
        );
      if (tier === 'national') return 'Corte Suprema de Justicia de la Nación';
      return CIDH;
    },
    nameRegister: 'Argentine given names and surnames',
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    localeTag: 'es-CO',
    currency: 'COP',
    texture: {
      givenNames: ['Valentina', 'Andrés', 'Daniela', 'Juan', 'Paola', 'Camilo', 'Natalia', 'Jhon', 'Luisa', 'Sebastián'],
      surnames: ['Rodríguez', 'Gómez', 'González', 'Martínez', 'Rojas', 'Moreno', 'Muñoz', 'Ospina', 'Mosquera', 'Cárdenas'],
      market: 'the Plaza de Paloquemao',
      neighbourhoods: ['Kennedy', 'Bosa', 'Suba', 'Engativá'],
      transportJob: 'buseta driver',
      depot: 'the Fontibón freight depot',
      money: { small: '$15 million', mid: '$100 million', large: '$700 million', huge: '$15 billion' },
    },
    stateNoun: 'departamento',
    supranational: iachr,
    districts: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'],
    policeService: (d) =>
      at(
        {
          Bogotá: 'Policía Metropolitana de Bogotá',
          Medellín: 'Policía Metropolitana del Valle de Aburrá',
          Cali: 'Policía Metropolitana de Santiago de Cali',
          Barranquilla: 'Policía Metropolitana de Barranquilla',
          Cartagena: 'Policía Metropolitana de Cartagena de Indias',
        },
        d,
        'Policía Nacional de Colombia',
      ),
    courtName: (tier, d) => {
      if (tier === 'district') return `Juzgado Penal Municipal de ${d}`;
      if (tier === 'state') return `Tribunal Superior de Distrito Judicial de ${d}`;
      if (tier === 'national') return 'Corte Suprema de Justicia';
      return CIDH;
    },
    nameRegister: 'Colombian given names and surnames, including Afro-Colombian',
  },
  CL: {
    code: 'CL',
    name: 'Chile',
    localeTag: 'es-CL',
    currency: 'CLP',
    texture: {
      givenNames: ['Catalina', 'Benjamín', 'Constanza', 'Matías', 'Javiera', 'Vicente', 'Francisca', 'Cristóbal', 'Antonia', 'Diego'],
      surnames: ['González', 'Muñoz', 'Rojas', 'Díaz', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Huenchumil'],
      market: 'La Vega Central',
      neighbourhoods: ['Estación Central', 'Pudahuel', 'Puente Alto', 'San Miguel'],
      transportJob: 'micro driver',
      depot: 'the San Bernardo freight depot',
      money: { small: '$3,000,000', mid: '$20,000,000', large: '$150 million', huge: '$3 billion' },
    },
    stateNoun: 'región',
    supranational: iachr,
    districts: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta', 'Temuco'],
    policeService: () => 'Carabineros de Chile',
    courtName: (tier, d) => {
      if (tier === 'district') return `Juzgado de Garantía de ${d}`;
      if (tier === 'state') return `Corte de Apelaciones de ${d}`;
      if (tier === 'national') return 'Corte Suprema de Chile';
      return CIDH;
    },
    nameRegister: 'Chilean given names and surnames, including Mapuche',
  },
  PE: {
    code: 'PE',
    name: 'Peru',
    localeTag: 'es-PE',
    currency: 'PEN',
    texture: {
      givenNames: ['Rosa', 'Luis', 'Milagros', 'Jorge', 'Fiorella', 'César', 'Yesenia', 'Wilmer', 'Carmen', 'Renzo'],
      surnames: ['Quispe', 'Flores', 'Sánchez', 'Rodríguez', 'Huamán', 'Mamani', 'Chávez', 'García', 'Torres', 'Vásquez'],
      market: 'the Mercado Central de Lima',
      neighbourhoods: ['San Juan de Lurigancho', 'Comas', 'Villa El Salvador', 'La Victoria'],
      transportJob: 'combi driver',
      depot: 'the Callao freight depot',
      money: { small: 'S/ 12,000', mid: 'S/ 80,000', large: 'S/ 600,000', huge: 'S/ 12 million' },
    },
    stateNoun: 'región',
    supranational: iachr,
    districts: ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco'],
    policeService: () => 'Policía Nacional del Perú',
    courtName: (tier, d) => {
      if (tier === 'district') return `Juzgado Penal Unipersonal de ${d}`;
      if (tier === 'state')
        return `Corte Superior de Justicia de ${at({ Trujillo: 'La Libertad', Chiclayo: 'Lambayeque' }, d, d)}`;
      if (tier === 'national') return 'Corte Suprema de Justicia de la República';
      return CIDH;
    },
    nameRegister: 'Peruvian given names and surnames, including Quechua and Aymara',
  },
  GH: {
    code: 'GH',
    name: 'Ghana',
    localeTag: 'en-GH',
    currency: 'GHS',
    texture: {
      givenNames: ['Ama', 'Kwame', 'Akosua', 'Kofi', 'Abena', 'Yaw', 'Adwoa', 'Kwabena', 'Efua', 'Mohammed'],
      surnames: ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Agyeman', 'Appiah', 'Addo', 'Quaye', 'Abdulai'],
      market: 'Makola Market',
      neighbourhoods: ['Nima', 'Madina', 'Jamestown', 'Kaneshie'],
      transportJob: 'trotro driver',
      depot: 'the Tema port freight depot',
      money: { small: 'GH₵ 40,000', mid: 'GH₵ 250,000', large: 'GH₵ 1.8 million', huge: 'GH₵ 40 million' },
    },
    stateNoun: 'region',
    supranational: au,
    districts: ['Accra', 'Kumasi', 'Tamale', 'Sekondi-Takoradi', 'Cape Coast'],
    policeService: (d) =>
      `${at(
        { Accra: 'Accra', Kumasi: 'Ashanti', Tamale: 'Northern', 'Sekondi-Takoradi': 'Western', 'Cape Coast': 'Central' },
        d,
        d,
      )} Regional Police Command`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District Court`;
      if (tier === 'state') return `${d === 'Sekondi-Takoradi' ? 'Sekondi' : d} High Court`;
      if (tier === 'national') return 'the Supreme Court of Ghana';
      return AFCHPR;
    },
    nameRegister: 'Ghanaian given names and surnames (Akan, Ga, Ewe and northern)',
  },
  UG: {
    code: 'UG',
    name: 'Uganda',
    localeTag: 'en-UG',
    currency: 'UGX',
    texture: {
      givenNames: ['Nakato', 'Okello', 'Babirye', 'Kato', 'Auma', 'Ronald', 'Brenda', 'Ivan', 'Aisha', 'Moses'],
      surnames: ['Mukasa', 'Okot', 'Tumusiime', 'Kiggundu', 'Byaruhanga', 'Nsubuga', 'Lubega', 'Opio', 'Wasswa', 'Twinomujuni'],
      market: 'Owino Market',
      neighbourhoods: ['Kisenyi', 'Katwe', 'Kawempe', 'Bwaise'],
      transportJob: 'boda boda rider',
      depot: 'the Nakawa goods depot',
      money: { small: 'USh 10 million', mid: 'USh 60 million', large: 'USh 450 million', huge: 'USh 10 billion' },
    },
    stateNoun: 'region',
    supranational: au,
    districts: ['Kampala', 'Gulu', 'Mbarara', 'Jinja', 'Lira'],
    policeService: (d) => (d === 'Kampala' ? 'Kampala Metropolitan Police' : 'Uganda Police Force'),
    courtName: (tier, d) => {
      if (tier === 'district')
        return d === 'Kampala' ? 'Buganda Road Chief Magistrate’s Court' : `${d} Chief Magistrate’s Court`;
      if (tier === 'state') return `the High Court of Uganda at ${d}`;
      if (tier === 'national') return 'the Supreme Court of Uganda';
      return AFCHPR;
    },
    nameRegister: 'Ugandan given names and surnames (Ganda, Acholi, Ankole and others)',
  },
  TZ: {
    code: 'TZ',
    name: 'Tanzania',
    localeTag: 'sw-TZ',
    currency: 'TZS',
    texture: {
      givenNames: ['Neema', 'Juma', 'Rehema', 'Baraka', 'Mwanaisha', 'Hamisi', 'Upendo', 'Emmanuel', 'Halima', 'Salim'],
      surnames: ['Mwakyusa', 'Msuya', 'Kimaro', 'Massawe', 'Shirima', 'Mushi', 'Mrema', 'Hassani', 'Lyimo', 'Mapunda'],
      market: 'Kariakoo Market',
      neighbourhoods: ['Tandale', 'Manzese', 'Temeke', 'Buguruni'],
      transportJob: 'bajaji driver',
      depot: 'the Ubungo goods depot',
      money: { small: 'TSh 5 million', mid: 'TSh 30 million', large: 'TSh 220 million', huge: 'TSh 5 billion' },
    },
    stateNoun: 'region',
    supranational: au,
    districts: ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya'],
    policeService: (d) => (d === 'Dar es Salaam' ? 'Dar es Salaam Special Police Zone' : 'Tanzania Police Force'),
    courtName: (tier, d) => {
      if (tier === 'district')
        return d === 'Dar es Salaam' ? 'Kisutu Resident Magistrate’s Court' : `${d} Resident Magistrate’s Court`;
      if (tier === 'state') return `the High Court of Tanzania at ${d}`;
      if (tier === 'national') return 'the Court of Appeal of Tanzania';
      return AFCHPR;
    },
    nameRegister: 'Tanzanian given names and surnames',
  },
  ET: {
    code: 'ET',
    name: 'Ethiopia',
    localeTag: 'am-ET',
    currency: 'ETB',
    texture: {
      givenNames: ['Hanna', 'Dawit', 'Selam', 'Abebe', 'Tigist', 'Yonas', 'Meron', 'Samuel', 'Hawi', 'Chala'],
      // Ethiopians carry a father's given name, not a family name.
      surnames: ['Bekele', 'Girma', 'Haile', 'Alemu', 'Tadesse', 'Mekonnen', 'Kebede', 'Tesfaye', 'Negash', 'Gudina'],
      market: 'the Merkato',
      neighbourhoods: ['Kolfe', 'Piassa', 'Gulele', 'Kirkos'],
      transportJob: 'bajaj driver',
      depot: 'the Modjo dry port',
      money: { small: 'Br 200,000', mid: 'Br 1.2 million', large: 'Br 9 million', huge: 'Br 200 million' },
    },
    stateNoun: 'region',
    supranational: au,
    districts: ['Addis Ababa', 'Dire Dawa', 'Adama', 'Hawassa', 'Bahir Dar'],
    policeService: (d) =>
      at(
        {
          'Addis Ababa': 'Addis Ababa Police Commission',
          'Dire Dawa': 'Dire Dawa Police Commission',
          Adama: 'Oromia Police Commission',
          Hawassa: 'Sidama Region Police Commission',
          'Bahir Dar': 'Amhara Region Police Commission',
        },
        d,
        'Ethiopian Federal Police',
      ),
    courtName: (tier, d) => {
      const federal = d === 'Addis Ababa' || d === 'Dire Dawa';
      if (tier === 'district') return federal ? `Federal First Instance Court, ${d}` : `${d} Woreda Court`;
      if (tier === 'state')
        return federal
          ? 'the Federal High Court'
          : `${at({ Adama: 'Oromia', Hawassa: 'Sidama', 'Bahir Dar': 'Amhara' }, d, d)} High Court`;
      if (tier === 'national') return 'the Federal Supreme Court of Ethiopia';
      if (tier === 'supranational') return ACHPR;
      return ICJ;
    },
    nameRegister: 'Ethiopian given names and father’s names (Amhara, Oromo and others)',
  },
  RW: {
    code: 'RW',
    name: 'Rwanda',
    localeTag: 'rw-RW',
    currency: 'RWF',
    texture: {
      givenNames: ['Aline', 'Eric', 'Diane', 'Patrick', 'Grace', 'Olivier', 'Claudine', 'Emmanuel', 'Divine', 'Innocent'],
      surnames: ['Uwimana', 'Niyonzima', 'Habimana', 'Nshimiyimana', 'Hakizimana', 'Ndayisaba', 'Iradukunda', 'Ntwari', 'Mugabo', 'Bizimana'],
      market: 'Kimironko Market',
      neighbourhoods: ['Nyamirambo', 'Kimisagara', 'Gikondo', 'Remera'],
      transportJob: 'moto driver',
      depot: 'the Kigali dry port',
      money: { small: 'RWF 2 million', mid: 'RWF 12 million', large: 'RWF 90 million', huge: 'RWF 2 billion' },
    },
    stateNoun: 'province',
    supranational: au,
    districts: ['Kigali', 'Musanze', 'Huye', 'Rubavu', 'Rwamagana'],
    policeService: () => 'Rwanda National Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d === 'Kigali' ? 'Nyarugenge' : d} Primary Court`;
      if (tier === 'state') return `${d === 'Kigali' ? 'Nyarugenge' : d} Intermediate Court`;
      if (tier === 'national') return 'the Supreme Court of Rwanda';
      return AFCHPR;
    },
    nameRegister: 'Rwandan given names and surnames',
  },
  CM: {
    code: 'CM',
    name: 'Cameroon',
    localeTag: 'fr-CM',
    currency: 'XAF',
    texture: {
      givenNames: ['Carine', 'Serge', 'Brigitte', 'Hervé', 'Aïssatou', 'Moussa', 'Nadège', 'Christian', 'Mireille', 'Blaise'],
      surnames: ['Mbarga', 'Ngono', 'Atangana', 'Fotso', 'Kamga', 'Nana', 'Hamadou', 'Ndongo', 'Tchinda', 'Essomba'],
      market: 'the Marché Mboppi',
      neighbourhoods: ['New Bell', 'Akwa', 'Bépanda', 'Deïdo'],
      transportJob: 'bendskin rider',
      depot: 'the Douala port freight depot',
      money: { small: '2,000,000 FCFA', mid: '12 million FCFA', large: '90 million FCFA', huge: '2 billion FCFA' },
    },
    stateNoun: 'région',
    supranational: au,
    districts: ['Douala', 'Yaoundé', 'Garoua', 'Bafoussam', 'Maroua'],
    policeService: () => 'Sûreté nationale',
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal de première instance de ${d}`;
      if (tier === 'state')
        return `Cour d’appel ${at(
          { Douala: 'du Littoral', Yaoundé: 'du Centre', Garoua: 'du Nord', Bafoussam: 'de l’Ouest', Maroua: 'de l’Extrême-Nord' },
          d,
          'du Centre',
        )}`;
      if (tier === 'national') return 'Cour suprême du Cameroun';
      return AFCHPR;
    },
    nameRegister: 'Cameroonian given names and surnames across regions',
  },
  SN: {
    code: 'SN',
    name: 'Senegal',
    localeTag: 'fr-SN',
    currency: 'XOF',
    texture: {
      givenNames: ['Aminata', 'Mamadou', 'Fatou', 'Ousmane', 'Awa', 'Cheikh', 'Mariama', 'Abdoulaye', 'Ndeye', 'Modou'],
      surnames: ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Gueye', 'Diallo', 'Sarr', 'Faye', 'Ba', 'Mendy'],
      market: 'the Marché Sandaga',
      neighbourhoods: ['Médina', 'Grand Yoff', 'Pikine', 'Colobane'],
      transportJob: 'car rapide driver',
      depot: 'the Port of Dakar freight depot',
      money: { small: '2,000,000 FCFA', mid: '12 million FCFA', large: '90 million FCFA', huge: '2 billion FCFA' },
    },
    stateNoun: 'région',
    supranational: au,
    districts: ['Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor'],
    policeService: () => 'Police nationale',
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal d’instance de ${d}`;
      if (tier === 'state') return `Cour d’appel de ${d}`;
      if (tier === 'national') return 'Cour suprême du Sénégal';
      return AFCHPR;
    },
    nameRegister: 'Senegalese given names and surnames (Wolof, Pulaar, Serer, Diola)',
  },
  CI: {
    code: 'CI',
    name: 'Côte d’Ivoire',
    localeTag: 'fr-CI',
    currency: 'XOF',
    texture: {
      givenNames: ['Aya', 'Koffi', 'Adjoua', 'Kouassi', 'Mariam', 'Sékou', 'Affoué', 'Didier', 'Salimata', 'Yao'],
      surnames: ['Kouamé', 'Koné', 'Traoré', 'Coulibaly', 'N’Guessan', 'Bamba', 'Kouadio', 'Touré', 'Diabaté', 'Konan'],
      market: 'the Marché d’Adjamé',
      neighbourhoods: ['Abobo', 'Yopougon', 'Treichville', 'Koumassi'],
      transportJob: 'gbaka driver',
      depot: 'the Vridi port freight depot',
      money: { small: '2,000,000 FCFA', mid: '12 million FCFA', large: '90 million FCFA', huge: '2 billion FCFA' },
    },
    stateNoun: 'région',
    supranational: au,
    districts: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'Daloa', 'San-Pédro'],
    policeService: () => 'Police nationale',
    courtName: (tier, d) => {
      if (tier === 'district')
        return d === 'Abidjan' ? 'Tribunal de première instance d’Abidjan-Plateau' : `Tribunal de première instance de ${d}`;
      if (tier === 'state')
        return at(
          { Bouaké: 'Cour d’appel de Bouaké', Yamoussoukro: 'Cour d’appel de Bouaké', Daloa: 'Cour d’appel de Daloa', 'San-Pédro': 'Cour d’appel de Daloa' },
          d,
          'Cour d’appel d’Abidjan',
        );
      if (tier === 'national') return 'Cour de cassation';
      return AFCHPR;
    },
    nameRegister: 'Ivorian given names and surnames (Akan, Mandé, Kru and Voltaic)',
  },
  ZW: {
    code: 'ZW',
    name: 'Zimbabwe',
    localeTag: 'en-ZW',
    // ZWG is the official currency, but everyday prices are quoted in US dollars.
    currency: 'USD',
    texture: {
      givenNames: ['Rutendo', 'Tawanda', 'Chipo', 'Simbarashe', 'Nokuthula', 'Sibusiso', 'Rumbidzai', 'Tonderai', 'Ruvimbo', 'Themba'],
      surnames: ['Moyo', 'Ncube', 'Sibanda', 'Dube', 'Nyathi', 'Mutasa', 'Mhlanga', 'Banda', 'Zhou', 'Makoni'],
      market: 'Mbare Musika',
      neighbourhoods: ['Mbare', 'Highfield', 'Glen View', 'Budiriro'],
      transportJob: 'kombi driver',
      depot: 'the Msasa freight depot',
      money: { small: 'US$3,000', mid: 'US$20,000', large: 'US$150,000', huge: 'US$3 million' },
    },
    stateNoun: 'province',
    supranational: au,
    districts: ['Harare', 'Bulawayo', 'Chitungwiza', 'Mutare', 'Gweru'],
    policeService: () => 'Zimbabwe Republic Police',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates Court`;
      if (tier === 'state') return `${at({ Chitungwiza: 'Harare', Gweru: 'Bulawayo' }, d, d)} High Court`;
      if (tier === 'national') return 'the Supreme Court of Zimbabwe';
      if (tier === 'supranational') return ACHPR;
      return ICJ;
    },
    nameRegister: 'Zimbabwean given names and surnames, Shona and Ndebele',
  },
  ZM: {
    code: 'ZM',
    name: 'Zambia',
    localeTag: 'en-ZM',
    currency: 'ZMW',
    texture: {
      givenNames: ['Natasha', 'Joseph', 'Mercy', 'Kelvin', 'Memory', 'Moses', 'Esther', 'Brian', 'Loveness', 'Kennedy'],
      surnames: ['Banda', 'Phiri', 'Mwale', 'Tembo', 'Mulenga', 'Chanda', 'Bwalya', 'Mwansa', 'Sakala', 'Musonda'],
      market: 'Soweto Market',
      neighbourhoods: ['Matero', 'Kalingalinga', 'Chawama', 'Kanyama'],
      transportJob: 'minibus driver',
      depot: 'the Lusaka dry port',
      money: { small: 'K 60,000', mid: 'K 400,000', large: 'K 3 million', huge: 'K 60 million' },
    },
    stateNoun: 'province',
    supranational: au,
    districts: ['Lusaka', 'Kitwe', 'Ndola', 'Kabwe', 'Livingstone'],
    policeService: () => 'Zambia Police Service',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Subordinate Court`;
      if (tier === 'state') return `the High Court for Zambia at ${d}`;
      if (tier === 'national') return 'the Supreme Court of Zambia';
      if (tier === 'supranational') return ACHPR;
      return ICJ;
    },
    nameRegister: 'Zambian given names and surnames',
  },
  UA: {
    code: 'UA',
    name: 'Ukraine',
    localeTag: 'uk-UA',
    currency: 'UAH',
    texture: {
      givenNames: ['Olena', 'Andriy', 'Oksana', 'Dmytro', 'Iryna', 'Oleksandr', 'Nataliia', 'Serhiy', 'Yulia', 'Taras'],
      // Surnames that read the same for women and men.
      surnames: ['Shevchenko', 'Kovalenko', 'Bondarenko', 'Tkachenko', 'Kravchuk', 'Melnyk', 'Boyko', 'Oliynyk', 'Koval', 'Lysenko'],
      market: 'the Bessarabsky Market',
      neighbourhoods: ['Troieshchyna', 'Obolon', 'Darnytsia', 'Podil'],
      transportJob: 'marshrutka driver',
      depot: 'the Darnytsia freight depot',
      money: { small: '₴150,000', mid: '₴1,000,000', large: '₴7 million', huge: '₴150 million' },
    },
    stateNoun: 'oblast',
    supranational: echr,
    districts: ['Kyiv', 'Kharkiv', 'Odesa', 'Dnipro', 'Lviv'],
    policeService: () => 'National Police of Ukraine',
    courtName: (tier, d) => {
      if (tier === 'district')
        return at(
          {
            Kyiv: 'Shevchenkivskyi District Court of Kyiv',
            Kharkiv: 'Kyivskyi District Court of Kharkiv',
            Odesa: 'Prymorskyi District Court of Odesa',
            Dnipro: 'Industrialnyi District Court of Dnipro',
            Lviv: 'Halytskyi District Court of Lviv',
          },
          d,
          `${d} District Court`,
        );
      if (tier === 'state') return `${d} Court of Appeal`;
      if (tier === 'national') return 'the Supreme Court of Ukraine';
      return ECHR;
    },
    nameRegister: 'Ukrainian given names and surnames',
  },
  JM: {
    code: 'JM',
    name: 'Jamaica',
    localeTag: 'en-JM',
    currency: 'JMD',
    texture: {
      givenNames: ['Shanice', 'Andre', 'Tashana', 'Dwayne', 'Kimberley', 'Romario', 'Ann-Marie', 'Delroy', 'Keisha', 'Orville'],
      surnames: ['Brown', 'Williams', 'Campbell', 'Thompson', 'Clarke', 'Grant', 'McKenzie', 'Chin', 'Morgan', 'Reid'],
      market: 'Coronation Market',
      neighbourhoods: ['Half Way Tree', 'Cross Roads', 'Papine', 'August Town'],
      transportJob: 'route taxi driver',
      depot: 'the Newport West freight depot',
      money: { small: 'J$500,000', mid: 'J$3.5 million', large: 'J$25 million', huge: 'J$500 million' },
    },
    stateNoun: 'parish',
    supranational: ccj,
    districts: ['Kingston', 'Montego Bay', 'Spanish Town', 'Portmore', 'Mandeville'],
    policeService: () => 'Jamaica Constabulary Force',
    courtName: (tier, d) => {
      const parish = at(
        { Kingston: 'Kingston and St Andrew', 'Montego Bay': 'St James', Mandeville: 'Manchester' },
        d,
        'St Catherine',
      );
      if (tier === 'district') return `${parish} Parish Court`;
      if (tier === 'state') return d === 'Kingston' ? 'the Home Circuit Court' : `the ${parish} Circuit Court`;
      if (tier === 'national') return 'the Court of Appeal of Jamaica';
      if (tier === 'supranational') return 'the Caribbean Court of Justice';
      return ICJ;
    },
    nameRegister: 'Jamaican given names and surnames',
  },
  TT: {
    code: 'TT',
    name: 'Trinidad and Tobago',
    localeTag: 'en-TT',
    currency: 'TTD',
    texture: {
      givenNames: ['Aaliyah', 'Rajesh', 'Shivani', 'Marlon', 'Kerry-Ann', 'Ravi', 'Chantal', 'Kareem', 'Anjali', 'Jason'],
      surnames: ['Ali', 'Mohammed', 'Ramdass', 'Joseph', 'Maharaj', 'Charles', 'Persad', 'Baptiste', 'Lewis', 'Singh'],
      market: 'the Port of Spain Central Market',
      neighbourhoods: ['Laventille', 'Belmont', 'Woodbrook', 'East Dry River'],
      transportJob: 'maxi-taxi driver',
      depot: 'the Sea Lots freight depot',
      money: { small: 'TT$30,000', mid: 'TT$200,000', large: 'TT$1.5 million', huge: 'TT$30 million' },
    },
    stateNoun: 'region',
    supranational: ccj,
    districts: ['Port of Spain', 'San Fernando', 'Chaguanas', 'Arima', 'Scarborough'],
    policeService: () => 'Trinidad and Tobago Police Service',
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates’ Court`;
      if (tier === 'state') return 'the High Court of Justice';
      if (tier === 'national') return 'the Court of Appeal of Trinidad and Tobago';
      if (tier === 'supranational') return 'the Caribbean Court of Justice';
      return ICJ;
    },
    nameRegister: 'Trinidadian given names and surnames — Afro-, Indo- and mixed Trinidadian',
  },
  QA: {
    code: 'QA',
    name: 'Qatar',
    localeTag: 'ar-QA',
    currency: 'QAR',
    texture: {
      givenNames: ['Maryam', 'Hamad', 'Aisha', 'Jassim', 'Priya', 'Suresh', 'Grace', 'Rashid', 'Sara', 'Abdulrahman'],
      surnames: ['Al-Kuwari', 'Al-Marri', 'Al-Sulaiti', 'Al-Mohannadi', 'Al-Emadi', 'Nair', 'Thapa', 'Fernandes', 'Hussain', 'Mathew'],
      market: 'Souq Waqif',
      neighbourhoods: ['Al Mansoura', 'Najma', 'Fereej Bin Mahmoud', 'Old Airport'],
      transportJob: 'taxi driver',
      depot: 'the Hamad Port freight depot',
      money: { small: 'QAR 20,000', mid: 'QAR 150,000', large: 'QAR 1 million', huge: 'QAR 25 million' },
    },
    stateNoun: 'municipality',
    supranational: null,
    districts: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor', 'Umm Salal'],
    policeService: () => 'Qatar Police',
    courtName: (tier) => {
      if (tier === 'district') return 'the Court of First Instance';
      if (tier === 'state') return 'the Court of Appeal';
      if (tier === 'national') return 'the Court of Cassation';
      return ICJ;
    },
    nameRegister: 'names of Qatar’s real population — Qatari, Arab, South Asian and Filipino',
  },
  KW: {
    code: 'KW',
    name: 'Kuwait',
    localeTag: 'ar-KW',
    currency: 'KWD',
    texture: {
      givenNames: ['Hessa', 'Fahad', 'Mariam', 'Bader', 'Noura', 'Yousef', 'Latifa', 'Anil', 'Priya', 'Abdullah'],
      surnames: ['Al-Mutairi', 'Al-Ajmi', 'Al-Rashidi', 'Al-Enezi', 'Al-Kandari', 'Behbehani', 'Al-Hajri', 'Pillai', 'Hussain', 'D’Souza'],
      market: 'Souq Al-Mubarakiya',
      neighbourhoods: ['Sharq', 'Mirqab', 'Qibla', 'Salhiya'],
      transportJob: 'taxi driver',
      depot: 'the Shuwaikh port freight depot',
      money: { small: 'KWD 1,500', mid: 'KWD 12,000', large: 'KWD 80,000', huge: 'KWD 2 million' },
    },
    stateNoun: 'governorate',
    supranational: null,
    districts: ['Kuwait City', 'Hawalli', 'Farwaniya', 'Jahra', 'Ahmadi'],
    policeService: () => 'Kuwait Police',
    courtName: (tier) => {
      if (tier === 'district') return 'the Court of First Instance';
      if (tier === 'state') return 'the Court of Appeal';
      if (tier === 'national') return 'the Court of Cassation';
      return ICJ;
    },
    nameRegister: 'names of Kuwait’s real population — Kuwaiti, Arab and South Asian',
  },
  DZ: {
    code: 'DZ',
    name: 'Algeria',
    localeTag: 'ar-DZ',
    currency: 'DZD',
    texture: {
      givenNames: ['Amina', 'Yacine', 'Lydia', 'Karim', 'Meriem', 'Sofiane', 'Samira', 'Rachid', 'Kahina', 'Walid'],
      surnames: ['Benali', 'Mebarki', 'Belkacem', 'Haddad', 'Hamidi', 'Bouzid', 'Saadi', 'Cherif', 'Aït Kaci', 'Messaoudi'],
      market: 'the Marché Meissonnier',
      neighbourhoods: ['Bab El Oued', 'Belouizdad', 'El Harrach', 'Bachdjerrah'],
      transportJob: 'taxi driver',
      depot: 'the Rouiba freight depot',
      money: { small: '500,000 DA', mid: '3 million DA', large: '25 million DA', huge: '500 million DA' },
    },
    stateNoun: 'wilaya',
    supranational: au,
    districts: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida'],
    policeService: (d) => `Sûreté de wilaya ${/^[AEIOU]/.test(d) ? 'd’' : 'de '}${d}`,
    courtName: (tier, d) => {
      const of = /^[AEIOU]/.test(d) ? `d’${d}` : `de ${d}`;
      if (tier === 'district') return d === 'Alger' ? 'Tribunal de Sidi M’Hamed' : `Tribunal ${of}`;
      if (tier === 'state') return `Cour ${of}`;
      if (tier === 'national') return 'Cour suprême';
      return AFCHPR;
    },
    nameRegister: 'Algerian given names and surnames, Arab and Kabyle',
  },
  TN: {
    code: 'TN',
    name: 'Tunisia',
    localeTag: 'ar-TN',
    currency: 'TND',
    texture: {
      givenNames: ['Mariem', 'Mohamed', 'Yosra', 'Aymen', 'Rania', 'Skander', 'Amira', 'Hamza', 'Ines', 'Oussama'],
      surnames: ['Ben Salah', 'Jlassi', 'Gharbi', 'Hammami', 'Mejri', 'Ayari', 'Chaabane', 'Khelifi', 'Dridi', 'Ben Amor'],
      market: 'the Marché Central de Tunis',
      neighbourhoods: ['El Kabaria', 'Bab Souika', 'Sidi Hassine', 'El Ouardia'],
      transportJob: 'louage driver',
      depot: 'the Radès port freight depot',
      money: { small: '15,000 DT', mid: '100,000 DT', large: '700,000 DT', huge: '15 million DT' },
    },
    stateNoun: 'gouvernorat',
    supranational: au,
    districts: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte'],
    policeService: () => 'Sûreté nationale',
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal de première instance de ${d}`;
      if (tier === 'state') return `Cour d’appel de ${d}`;
      if (tier === 'national') return 'Cour de cassation';
      return AFCHPR;
    },
    nameRegister: 'Tunisian given names and surnames',
  },
};

/**
 * Anywhere we have not hand-localised. Still uses the player's real country,
 * so the experience degrades to "plausible" rather than to "somewhere else".
 */
export function genericProfile(code: string, displayName?: string): CountryProfile {
  const name = displayName ?? code;
  return {
    code,
    name,
    localeTag: 'en',
    currency: 'local currency',
    // Deliberately placeless. An unlisted country gets prose that avoids
    // claiming a culture we have not actually localised, rather than borrowing
    // someone else's.
    texture: {
      givenNames: ['Alex', 'Sam', 'Jo', 'Nadia', 'Chris', 'Toma', 'Rea', 'Nour', 'Dani', 'Kim'],
      surnames: ['Marek', 'Ferreira', 'Haddad', 'Novak', 'Silva', 'Adler', 'Costa', 'Ivanov', 'Farah', 'Ross'],
      market: 'the central market',
      neighbourhoods: ['the old quarter', 'the east side', 'the river district', 'the north end'],
      transportJob: 'delivery driver',
      depot: 'the central goods depot',
      money: {
        small: 'a few thousand',
        mid: 'twenty-odd thousand',
        large: 'a hundred and fifty thousand',
        huge: 'several million',
      },
    },
    stateNoun: 'region',
    supranational: null,
    // Five, so the district-unlock ladder still has rungs. Placeless on purpose,
    // and article-free because they are dropped into "The {district} Herald"
    // and "the {district} freight corridor".
    districts: ['Capital District', 'Harbour District', 'Northern District', 'Eastern District', 'Old Town'],
    policeService: (d) => `${d} police service`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Court`; // "Harbour District Court", not "… District District Court"
      if (tier === 'state') return `${d} Regional Court`;
      if (tier === 'national') return `the Supreme Court of ${name}`;
      return 'the International Court of Justice';
    },
    nameRegister: `given names and surnames common in ${name}`,
  };
}

export function profileFor(code: string | null | undefined): CountryProfile {
  if (!code) return COUNTRIES.NO!; // a juror always sits somewhere
  return COUNTRIES[code.toUpperCase()] ?? genericProfile(code.toUpperCase());
}

/**
 * The ladder for a given country. Countries with no supranational bench skip
 * that rung rather than inventing one — a US juror goes national → international.
 */
export function ladderFor(code: string | null | undefined): Tier[] {
  const profile = profileFor(code);
  return TIER_ORDER.filter((t) => t !== 'supranational' || profile.supranational !== null);
}

/** What this rung is called to the player, in their own country's language of government. */
export function tierLabel(tier: Tier, code: string | null | undefined): string {
  const p = profileFor(code);
  switch (tier) {
    case 'district':
      return 'District';
    case 'state':
      return p.stateNoun.charAt(0).toUpperCase() + p.stateNoun.slice(1);
    case 'national':
      return 'National';
    case 'supranational':
      return p.supranational ?? 'Supranational';
    case 'international':
      return 'International';
    case 'world':
      return 'World';
  }
}

export function nextTier(tier: Tier, code: string | null | undefined): Tier | null {
  const ladder = ladderFor(code);
  const i = ladder.indexOf(tier);
  if (i === -1 || i === ladder.length - 1) return null;
  return ladder[i + 1]!;
}

/** Deterministic home district when we only know the country. */
export function districtFor(code: string | null | undefined, seed: string): string {
  const p = profileFor(code);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return p.districts[Math.abs(h) % p.districts.length]!;
}
