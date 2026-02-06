const axios = require('axios');
const admin = require('firebase-admin');

// 1. Lade die Zugangsdaten aus den GitHub Secrets
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_AUCTIONS);

// 2. Initialisiere die Firebase Admin Verbindung
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://auctionpricehistory-default-rtdb.europe-west1.firebasedatabase.app/"
});

const db = admin.database();
const auctionsRef = db.ref('endedAuctions');

async function trackEndedAuctions() {
  try {
    console.log('Rufe aktive Auktionen von der API ab...');
    const response = await axios.get('https://api.opsucht.net/auctions/active');
    const activeAuctions = response.data;

    if (!activeAuctions) {
      console.log('Keine Daten von der API erhalten.');
      process.exit(0);
    }

    // KORREKTUR: Berücksichtige die Zeitzone (CEST = UTC+2)
    // Wir holen die UTC-Zeit und addieren 2 Stunden, um sie mit den API-Zeiten zu vergleichen.
    const now_utc = new Date();
    const now_cest = new Date(now_utc.getTime() + (2 * 60 * 60 * 1000));

    console.log(`Aktuelle UTC-Zeit: ${now_utc.toISOString()}`);
    console.log(`Angenommene CEST-Zeit für Vergleich: ${now_cest.toISOString()}`);

    let foundEndedAuction = false;

    // Gehe jede Auktion durch
    for (const auction of Object.values(activeAuctions)) {
      const endTime = new Date(auction.endTime);

      // Vergleiche die Endzeit mit unserer angepassten "Jetzt"-Zeit
      if (endTime < now_cest) {
        foundEndedAuction = true;
        const auctionId = auction.uid;

        // PRÜFUNG AUF DUPLIKATE
        const snapshot = await auctionsRef.child(auctionId).get();

        if (snapshot.exists()) {
          console.log(`Auktion ${auctionId} wurde bereits gespeichert. Überspringe.`);
        } else {
          console.log(`Neue beendete Auktion gefunden: ${auctionId}. Speichere...`);
          await auctionsRef.child(auctionId).set({
            itemName: auction.item.displayName || auction.item.material,
            finalPrice: auction.currentBid,
            endTime: auction.endTime,
            seller: auction.seller
          });
          console.log(`Auktion ${auctionId} erfolgreich gespeichert.`);
        }
      }
    }

    if (!foundEndedAuction) {
      console.log('Keine beendeten Auktionen in der aktuellen Liste gefunden (unter Berücksichtigung der Zeitzone).');
    }

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
    process.exit(1);
  } finally {
    await db.goOffline();
    process.exit(0);
  }
}

trackEndedAuctions();
