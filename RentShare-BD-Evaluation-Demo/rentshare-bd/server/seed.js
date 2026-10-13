import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, hashPassword } from './db.js';

export const DEMO_PASSWORD = 'RentShare123!';
export const DEMO_ACCOUNTS = [
  { name: 'Farhan Ahmed', email: 'landlord@rentshare.demo', role: 'landlord', occupation: 'Property owner', institution: 'RentShare BD', bio: 'Thoughtfully maintained spaces for students and young professionals.' },
  { name: 'Ayesha Rahman', email: 'tenant@rentshare.demo', role: 'tenant', occupation: 'CSE student', institution: 'Daffodil International University', bio: 'Looking for a calm home near campus. I enjoy reading, weekend cooking, and a tidy shared space.', preferences: { budgetMin: 5000, budgetMax: 10000, location: 'Ashulia', smoking: 'no', cleanliness: 'tidy', sleep: 'early', noise: 'quiet', schedule: 'day' } },
  { name: 'Nusrat Jahan', email: 'nusrat@rentshare.demo', role: 'tenant', occupation: 'Architecture student', institution: 'Daffodil International University', bio: 'A tidy, quiet flatmate who loves sketching and morning walks. Usually on campus during the day.', preferences: { budgetMin: 6000, budgetMax: 9000, location: 'Ashulia', smoking: 'no', cleanliness: 'tidy', sleep: 'regular', noise: 'quiet', schedule: 'day' } },
  { name: 'Samiul Islam', email: 'samiul@rentshare.demo', role: 'tenant', occupation: 'Software engineering student', institution: 'Daffodil International University', bio: 'Friendly and considerate. I split time between classes and freelance projects, and prefer a quiet study corner.', preferences: { budgetMin: 7000, budgetMax: 11000, location: 'Ashulia', smoking: 'no', cleanliness: 'balanced', sleep: 'regular', noise: 'quiet', schedule: 'flexible' } },
  { name: 'Mehedi Hasan', email: 'mehedi@rentshare.demo', role: 'tenant', occupation: 'Junior designer', institution: 'Creative studio, Dhaka', bio: 'Working full-time in design. Looking for a clean place with a simple commute and respectful housemates.', preferences: { budgetMin: 8000, budgetMax: 12000, location: 'Mirpur', smoking: 'no', cleanliness: 'tidy', sleep: 'regular', noise: 'balanced', schedule: 'day' } },
  { name: 'Tanvir Hossain', email: 'tanvir@rentshare.demo', role: 'tenant', occupation: 'Business student', institution: 'University of Liberal Arts Bangladesh', bio: 'An outgoing night owl who enjoys music and group study. Hoping to find people with a similar routine.', preferences: { budgetMin: 12000, budgetMax: 16000, location: 'Dhanmondi', smoking: 'yes', cleanliness: 'relaxed', sleep: 'late', noise: 'social', schedule: 'night' } },
];

const listings = [
  { seedKey: 'ashulia-sunlit', title: 'Sunlit room near DIU campus', location: 'Ashulia', address: 'Daffodil Smart City Road, Ashulia, Savar', rent: 7500, deposit: 7500, bedrooms: 1, bathrooms: 1, area: 240, furnished: true, availableFrom: '2026-11-01', image: '/images/room-sunlight.png', amenities: ['Wi-Fi', 'Study desk', 'Shared kitchen', 'Balcony'], description: 'A bright private room with a dedicated study space, natural light, and access to a shared kitchen. A convenient base for campus life in Ashulia. Monthly rent is for the listed room; utilities are separate. This is a fictional demonstration listing.' },
  { seedKey: 'dhanmondi-studio', title: 'A calm corner in Dhanmondi', location: 'Dhanmondi', address: 'Road 8A, Dhanmondi, Dhaka', rent: 12500, deposit: 12500, bedrooms: 1, bathrooms: 1, area: 320, furnished: true, availableFrom: '2026-10-20', image: '/images/room-studio.png', amenities: ['Wi-Fi', 'Air conditioning', 'Study desk', 'Lift'], description: 'A comfortable furnished room close to cafés, universities, and daily essentials. Includes a work desk and a private bathroom. Monthly rent is for the listed room; electricity and internet charges are separate. This is a fictional demonstration listing.' },
  { seedKey: 'mirpur-budget', title: 'Easy living in Mirpur 10', location: 'Mirpur', address: 'Block B, Mirpur 10, Dhaka', rent: 8500, deposit: 8500, bedrooms: 1, bathrooms: 1, area: 260, furnished: false, availableFrom: '2026-10-25', image: '/images/room-sunlight.png', amenities: ['Shared kitchen', 'Balcony', 'Security', 'Lift'], description: 'Make this airy room your own. A practical option for students and professionals with nearby shops and transport links. The room is unfurnished, with a shared kitchen and balcony. This is a fictional demonstration listing.' },
  { seedKey: 'uttara-room', title: 'Quiet mornings in Uttara', location: 'Uttara', address: 'Sector 7, Uttara, Dhaka', rent: 11000, deposit: 11000, bedrooms: 1, bathrooms: 1, area: 300, furnished: true, availableFrom: '2026-11-05', image: '/images/room-studio.png', amenities: ['Wi-Fi', 'Study desk', 'Security', 'Balcony'], description: 'A furnished room in a peaceful residential setting, with plenty of daylight and a comfortable work area. Suits a steady study or work routine. Monthly rent excludes shared utilities. This is a fictional demonstration listing.' },
  { seedKey: 'ashulia-budget', title: 'Campus-side shared apartment', location: 'Ashulia', address: 'Birulia Road, Ashulia, Savar', rent: 6000, deposit: 6000, bedrooms: 1, bathrooms: 1, area: 210, furnished: false, availableFrom: '2026-10-15', image: '/images/room-studio.png', amenities: ['Wi-Fi', 'Shared kitchen', 'Security'], description: 'An affordable private room inside a shared apartment, with a simple commute to campus. Bring your own furniture and settle into a student-friendly routine. Shared utility bills are additional. This is a fictional demonstration listing.' },
  { seedKey: 'mirpur-large', title: 'Room to unwind in Mirpur', location: 'Mirpur', address: 'Pallabi, Mirpur 12, Dhaka', rent: 9500, deposit: 9500, bedrooms: 1, bathrooms: 1, area: 290, furnished: true, availableFrom: '2026-11-01', image: '/images/room-sunlight.png', amenities: ['Wi-Fi', 'Study desk', 'Shared kitchen', 'Lift'], description: 'A generous furnished room with warm natural light and space for work or study. A shared kitchen makes daily cooking easy. Rent is for one room, with utilities split separately. This is a fictional demonstration listing.' },
];

/** Idempotent: inserts missing demo records without resetting user edits or deleting data. */
export function seedDatabase(db) {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash,role,occupation,institution,bio,preferences) VALUES (?,?,?,?,?,?,?,?)');
  const insertProperty = db.prepare('INSERT OR IGNORE INTO properties (owner_id,seed_key,title,location,address,rent,deposit,bedrooms,bathrooms,area,furnished,available_from,description,amenities,image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  try {
    for (const u of DEMO_ACCOUNTS) {
      if (!db.prepare('SELECT id FROM users WHERE email = ?').get(u.email)) insertUser.run(u.name, u.email, hashPassword(DEMO_PASSWORD), u.role, u.occupation, u.institution, u.bio, u.preferences ? JSON.stringify(u.preferences) : null);
    }
    const landlord = db.prepare('SELECT id, role FROM users WHERE email = ?').get('landlord@rentshare.demo');
    if (landlord?.role === 'landlord') for (const p of listings) insertProperty.run(landlord.id, p.seedKey, p.title, p.location, p.address, p.rent, p.deposit, p.bedrooms, p.bathrooms, p.area, Number(p.furnished), p.availableFrom, p.description, JSON.stringify(p.amenities), p.image);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dbPath = process.env.DB_PATH || path.join(projectRoot, 'data', 'rentshare.sqlite');
  const db = openDatabase(dbPath);
  seedDatabase(db);
  console.log('Demo accounts and listings are ready. Existing records were preserved.');
  db.close();
}
