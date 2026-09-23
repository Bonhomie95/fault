/**
 * Whether a given name reads as a woman's, a man's, or either.
 *
 * The courtroom used to decide how each person presents from a seed channel,
 * independent of their name. That was harmless for a drawn face and is not
 * for a rendered one: "Ngozi Chukwu" played by a man is a casting error the
 * player sees in the first second, and it takes them out of the room.
 *
 * Names are drawn by the server from the registers in domain/jurisdiction, so
 * this can be a closed list. Anything not on it — a unisex name, or a name the
 * model invented before the server started choosing — answers null, and the
 * client falls back to the seed exactly as before.
 *
 * Name is not evidence of anything. The registers are sampled blind to the
 * verdict, so presentation stays as uncorrelated with guilt as it always was.
 */

const FEMININE = new Set([
  'Ingrid', 'Kari', 'Astrid', 'Maja', 'Amina',
  'Tasha', 'Nicole', 'Beth', 'Shauna',
  'Aisha', 'Nadia', 'Priya', 'Roisin', 'Chloe',
  'Adaeze', 'Folake', 'Chinelo', 'Hauwa', 'Ngozi',
  'Wanjiru', 'Njeri', 'Achieng', 'Fatuma',
  'Lena', 'Fatma', 'Aylin', 'Katrin', 'Sofia',
  'Camille', 'Élodie', 'Aïcha', 'Fanta',
  'Meera', 'Fatima', 'Ananya', 'Lakshmi',
  'Camila', 'Luana', 'Beatriz', 'Juliana', 'Nara',
  'Thandiwe', 'Lerato', 'Nomsa', 'Zanele',
  'Emily', 'Chloé', 'Olivia', 'Mei', // CA
  'Aroha', 'Mere', 'Grace', // NZ
  'Aoife', 'Niamh', 'Ciara', 'Siobhán', 'Agnieszka', // IE
  'Lucía', 'Carmen', 'Nerea', 'Fátima', 'Marta', // ES
  'Giulia', 'Francesca', 'Chiara', 'Sara', 'Elena', // IT
  'Inês', 'Mariana', 'Ana', // PT
  'Sanne', 'Fleur', 'Emma', 'Lotte', // NL
  'Louise', 'Julie', 'Yasmine', 'Elise', // BE
  'Elin', 'Amira', 'Linnea', // SE
  'Freja', 'Ida', 'Sofie', 'Mette', 'Camilla', // DK
  'Aino', 'Emilia', 'Laura', 'Hanna', 'Sanna', // FI
  'Anna', 'Katarzyna', 'Magdalena', 'Olena', // PL
  'Katharina', 'Elif', 'Lisa', 'Julia', // AT
  'Lara', 'Noemi', 'Céline', // CH
  'Tereza', 'Lucie', 'Kateřina', 'Veronika', 'Eliška', // CZ
  'Maria', 'Eleni', 'Katerina', 'Despina', // GR
  'Andreea', 'Ioana', 'Cristina', 'Roxana', // RO
  'Eszter', 'Réka', 'Zsófia', 'Katalin', // HU
  'Zeynep', 'Ayşe', 'Rojda', 'Merve', // TR
  'Noa', 'Tamar', 'Shira', 'Rania', 'Yael', // IL
  'Mariam', 'Maricel', 'Noura', // AE
  'Reem', 'Hessa', 'Lama', // SA
  'Yasmin', 'Heba', 'Salma', 'Marina', // EG
  'Khadija', 'Imane', 'Meryem', // MA
  'Ayesha', 'Sana', 'Hina', 'Mehwish', 'Rabia', // PK
  'Nusrat', 'Farhana', 'Sumaiya', 'Tahmina', 'Anjali', // BD
  'Nimali', 'Tharushi', 'Fathima', 'Kavitha', 'Dilani', // LK
  'Siti', 'Dewi', 'Putri', 'Ayu', 'Fitri', // ID
  'Nurul', 'Aisyah', // MY
  'Rachel', 'Jasmine', // SG
  'Angelica', 'Kristine', 'Rowena', // PH
  'Siriporn', 'Kanya', 'Pimchanok', 'Ratana', 'Malee', // TH
  'Lan', 'Hương', 'Mai', 'Trang', 'Thảo', // VN
  'Sakura', 'Yui', 'Misaki', 'Emi', // JP
  'Seo-yeon', 'Ha-eun', 'Ye-jin', 'Eun-ji', 'Min-seo', // KR
  'Xiaomei', 'Yuting', 'Xinyi', 'Meiling', 'Lili', // CN
  'Ximena', 'Fernanda', 'Daniela', 'Valeria', 'Guadalupe', // MX
  'Sofía', 'Valentina', 'Florencia', // AR
  'Paola', 'Natalia', 'Luisa', // CO
  'Catalina', 'Constanza', 'Javiera', 'Francisca', 'Antonia', // CL
  'Rosa', 'Milagros', 'Fiorella', 'Yesenia', // PE
  'Ama', 'Akosua', 'Abena', 'Adwoa', 'Efua', // GH
  'Nakato', 'Babirye', 'Auma', 'Brenda', // UG
  'Neema', 'Rehema', 'Mwanaisha', 'Upendo', 'Halima', // TZ
  'Selam', 'Tigist', 'Meron', 'Hawi', // ET
  'Aline', 'Diane', 'Claudine', 'Divine', // RW
  'Carine', 'Brigitte', 'Aïssatou', 'Nadège', 'Mireille', // CM
  'Aminata', 'Fatou', 'Awa', 'Mariama', 'Ndeye', // SN
  'Aya', 'Adjoua', 'Affoué', 'Salimata', // CI
  'Rutendo', 'Chipo', 'Nokuthula', 'Rumbidzai', 'Ruvimbo', // ZW
  'Natasha', 'Mercy', 'Memory', 'Esther', 'Loveness', // ZM
  'Oksana', 'Iryna', 'Nataliia', 'Yulia', // UA
  'Shanice', 'Tashana', 'Kimberley', 'Ann-Marie', 'Keisha', // JM
  'Aaliyah', 'Shivani', 'Kerry-Ann', 'Chantal', // TT
  'Maryam', // QA
  'Latifa', // KW
  'Lydia', 'Meriem', 'Samira', 'Kahina', // DZ
  'Mariem', 'Yosra', 'Ines', // TN
]);

const MASCULINE = new Set([
  'Lars', 'Sindre', 'Kjetil', 'Håkon', 'Emil',
  'Marcus', 'Luis', 'Ray', 'Andre', 'Hector',
  'Callum', 'Gareth', 'Dean', 'Tomasz',
  'Emeka', 'Ibrahim', 'Tunde', 'Bashir',
  'Otieno', 'Kipchoge', 'Musa', 'Brian', 'Kamau',
  'Jonas', 'Stefan', 'Matthias', 'Mehmet', 'Bernd',
  'Karim', 'Thomas', 'Julien', 'Mathieu', 'Bruno',
  'Rohit', 'Arjun', 'Vikram', 'Sameer', 'Imran',
  'Rafael', 'Thiago', 'Marcos', 'Everton', 'Caio',
  'Sipho', 'Pieter', 'Riaan', 'Bongani',
  'Liam', 'Jaskaran', 'Ryan', 'Owen', // CA
  'Jack', 'Lachlan', 'Nathan', 'Tom', 'Hamish', // AU
  'Tama', 'Sione', 'Wiremu', 'James', // NZ
  'Seán', 'Darragh', 'Cian', 'Oisín', 'Tomás', // IE
  'Javier', 'Alejandro', 'Pablo', 'Sergio', 'Iker', // ES
  'Marco', 'Luca', 'Alessandro', 'Giuseppe', 'Youssef', // IT
  'João', 'Tiago', 'Rui', 'Diogo', 'Edson', // PT
  'Daan', 'Mohamed', 'Bram', 'Ruben', 'Kevin', // NL
  'Lucas', 'Arthur', 'Thibault', 'Jens', // BE
  'Oscar', 'Erik', 'Johan', 'Ahmed', 'Anders', // SE
  'Mads', 'Mikkel', 'Rasmus', 'Ali', 'Frederik', // DK
  'Mikko', 'Juha', 'Ville', 'Antti', 'Abdi', // FI
  'Piotr', 'Krzysztof', 'Paweł', 'Michał', // PL
  'Lukas', 'Florian', 'Dragan', 'Tobias', // AT
  'Nicolas', 'Arben', 'Reto', // CH
  'Jakub', 'Tomáš', 'Petr', 'Martin', 'Ondřej', // CZ
  'Giorgos', 'Dimitris', 'Nikos', 'Kostas', 'Yannis', // GR
  'Andrei', 'Mihai', 'Alexandru', 'Gabriel', 'Florin', // RO
  'Bence', 'Balázs', 'Gábor', 'László', 'Dávid', // HU
  'Mustafa', 'Emre', 'Burak', 'Baran', // TR
  'Yosef', 'Avi', 'Ahmad', 'Itai', 'Daniel', // IL
  'Rashid', 'Khalid', 'Omar', 'Rajesh', // AE
  'Abdullah', 'Faisal', 'Mohammed', 'Saad', 'Turki', // SA
  'Mahmoud', 'Mostafa', 'Mina', // EG
  'Hamza', 'Mehdi', 'Ayoub', 'Amine', // MA
  'Bilal', 'Usman', 'Asif', // PK
  'Rahim', 'Tanvir', 'Rafiq', 'Arif', 'Rajib', // BD
  'Kasun', 'Chaminda', 'Suresh', 'Kumaran', // LK
  'Budi', 'Agus', 'Rizky', 'Hendra', 'Yohanes', // ID
  'Hafiz', 'Jason', 'Kumar', // MY
  'Farid', 'Ravi', 'Darren', 'Kelvin', // SG
  'Juan', 'Mark', 'Jerome', 'Rodel', 'Carlo', // PH
  'Somchai', 'Nattapong', 'Anan', 'Wichai', 'Thanawat', // TH
  'Tuấn', 'Hùng', 'Dũng', 'Quang', 'Phúc', // VN
  'Haruto', 'Takumi', 'Kenji', 'Daiki', 'Sota', // JP
  'Min-jun', 'Do-yun', 'Hyun-woo', 'Jae-hyun', 'Seo-jun', // KR
  'Haoran', 'Zihao', 'Junjie', 'Jianguo', 'Qiang', // CN
  'José', 'Miguel', 'Jesús', 'Eduardo', // MX
  'Mateo', 'Santiago', 'Joaquín', 'Facundo', 'Martín', // AR
  'Andrés', 'Camilo', 'Jhon', 'Sebastián', // CO
  'Benjamín', 'Matías', 'Vicente', 'Cristóbal', 'Diego', // CL
  'Jorge', 'César', 'Wilmer', 'Renzo', // PE
  'Kwame', 'Kofi', 'Yaw', 'Kwabena', // GH
  'Okello', 'Kato', 'Ronald', 'Ivan', 'Moses', // UG
  'Juma', 'Baraka', 'Hamisi', 'Emmanuel', 'Salim', // TZ
  'Dawit', 'Abebe', 'Yonas', 'Samuel', 'Chala', // ET
  'Eric', 'Patrick', 'Olivier', 'Innocent', // RW
  'Serge', 'Hervé', 'Moussa', 'Christian', 'Blaise', // CM
  'Mamadou', 'Ousmane', 'Cheikh', 'Abdoulaye', 'Modou', // SN
  'Koffi', 'Kouassi', 'Sékou', 'Didier', 'Yao', // CI
  'Tawanda', 'Simbarashe', 'Sibusiso', 'Tonderai', 'Themba', // ZW
  'Joseph', 'Kennedy', // ZM
  'Andriy', 'Dmytro', 'Oleksandr', 'Serhiy', 'Taras', // UA
  'Dwayne', 'Romario', 'Delroy', 'Orville', // JM
  'Marlon', 'Kareem', // TT
  'Hamad', 'Jassim', 'Abdulrahman', // QA
  'Fahad', 'Bader', 'Yousef', 'Anil', // KW
  'Yacine', 'Sofiane', 'Rachid', 'Walid', // DZ
  'Aymen', 'Skander', 'Oussama', // TN
]);

/** true: reads as a woman. false: as a man. null: either, or unknown. */
export function presentsFeminine(fullName: string): boolean | null {
  const given = fullName.trim().split(/\s+/)[0] ?? '';
  if (FEMININE.has(given)) return true;
  if (MASCULINE.has(given)) return false;
  return null;
}
