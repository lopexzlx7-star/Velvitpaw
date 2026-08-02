import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc')));

const counts = {};
for (const d of snap.docs) {
  const name = d.data().authorName || '(sem nome)';
  counts[name] = (counts[name] || 0) + 1;
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('\n── Autores encontrados ──────────────────');
for (const [name, count] of sorted) {
  console.log(`  ${String(count).padStart(4, ' ')} posts  →  ${name}`);
}
console.log(`\nTotal: ${snap.size} posts, ${sorted.length} autores\n`);
process.exit(0);
