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

    // KORREKTE ZEITBERECHNUNG: Hol die aktuelle Zeit in der deutschen Zeitzone
    const nowInGermany = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    console.log(`Aktuelle Zeit in Deutschland (für Vergleich): ${nowInGermany.toISOString()}`);

    let foundEndedAuction = false;

    // Gehe jede Auktion durch
    for (const auction of Object.values(activeAuctions)) {
      const endTime = new Date(auction.endTime);

      // Vergleiche die Endzeit mit der aktuellen deutschen Zeit
      if (endTime < nowInGermany) {
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
