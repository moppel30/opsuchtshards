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
      return;
    }

    const now = Date.now();
    let foundEndedAuction = false;

    // Gehe jede Auktion durch
    for (const auction of Object.values(activeAuctions)) {
      const endTime = new Date(auction.endTime).getTime();

      // Prüfe, ob die Auktion beendet ist
      if (endTime < now) {
        foundEndedAuction = true;
        const auctionId = auction.uid;

        // PRÜFUNG AUF DUPLIKATE: Schau nach, ob diese Auktions-ID schon existiert
        const snapshot = await auctionsRef.child(auctionId).get();

        if (snapshot.exists()) {
          console.log(`Auktion ${auctionId} wurde bereits gespeichert. Überspringe.`);
        } else {
          console.log(`Neue beendete Auktion gefunden: ${auctionId}. Speichere...`);
          // Speichere die relevanten Daten unter der eindeutigen Auktions-ID
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
      console.log('Keine beendeten Auktionen in der aktuellen Liste gefunden.');
    }

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
    process.exit(1); // Beende mit Fehlercode, damit GitHub es als Fehler markiert
  } finally {
    // Beende die Datenbankverbindung, damit der Prozess sauber schließt
    await db.goOffline();
    process.exit(0);
  }
}

trackEndedAuctions();
