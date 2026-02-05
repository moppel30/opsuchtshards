const axios = require('axios');
const admin = require('firebase-admin');

// 1. Firebase-Konfiguration aus den GitHub Secrets laden
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: serviceAccount.databaseURL
});

const db = admin.database();

async function fetchAndSaveShardHistory() {
  try {
    console.log('Rufe Shard-Preise von der API ab...');
    const response = await axios.get('https://api.opsucht.net/merchant/rates');
    const shardRates = response.data;

    if (!shardRates || shardRates.length === 0) {
      console.log('Keine Daten von der API erhalten. Beende.');
      return;
    }
    console.log('Daten erfolgreich abgerufen.');

    const timestamp = Date.now();
    const ref = db.ref(`shardHistory/${timestamp}`);

    console.log(`Speichere Daten in Firebase unter dem Zeitstempel: ${timestamp}`);
    await ref.set(shardRates);
    console.log('Daten erfolgreich in Firebase gespeichert!');

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
  } finally {
    // Wichtig, damit der Prozess sauber beendet wird
    db.goOffline();
  }
}

fetchAndSaveShardHistory();
