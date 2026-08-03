const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs'); // Node.js File System module

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://shardhistory-121a4-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();

async function fetchAndSaveShardHistory() {
  try {
    console.log('Rufe Shard-Preise von der API ab...');
    const response = await axios.get('https://api.opsucht.net/merchant/rates');
    const shardRates = response.data;

    if (!shardRates || shardRates.length === 0) {
      console.log('Keine Daten von der API erhalten. Beende.');
      process.exit(0);
    }
    console.log('Daten erfolgreich abgerufen.');

    const timestamp = Date.now();
    const ref = db.ref(`shardHistory/${timestamp}`);

    console.log(`Speichere Daten in Firebase unter dem Zeitstempel: ${timestamp}`);
    await ref.set(shardRates);
    console.log('Daten erfolgreich in Firebase gespeichert!');

    // NEU: Lade die gesamte Historie und schreibe sie in eine statische JSON-Datei
    console.log('Lade gesamte Historie für die JSON-Datei...');
    const historySnapshot = await db.ref('shardHistory').get();
    const historyData = historySnapshot.val();
    fs.writeFileSync('shard-history.json', JSON.stringify(historyData, null, 2));
    console.log('shard-history.json wurde erfolgreich erstellt.');

    process.exit(0);

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
    process.exit(1);
  }
}

fetchAndSaveShardHistory();



