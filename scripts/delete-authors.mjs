import { initializeApp } from 'firebase/app';
import { initializeFirestore, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

const AUTHORS = ['dasilvaisaq', 'neg_o20', 'dasilva077', 'pauzudo'];

let total = 0;
for (const name of AUTHORS) {
  const snap = await getDocs(query(collection(db, 'posts'), where('authorName', '==', name)));
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    total++;
    console.log(`  ✓ deletado: "${d.data().title || '(sem título)'}"  [@${name}]`);
  }
}

console.log(`\nPronto — ${total} posts removidos.\n`);
process.exit(0);
