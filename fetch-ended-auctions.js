const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_AUCTIONS);

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

    const nowInGermany = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    console.log(`================ ZEIT-CHECK ================`);
    console.log(`Aktuelle deutsche Zeit (für Vergleich): ${nowInGermany.toLocaleString('de-DE')}`);
    console.log(`============================================`);

    let foundEndedAuction = false;

    for (const auction of Object.values(activeAuctions)) {
      const endTime = new Date(auction.endTime);

      if (endTime < nowInGermany) {
        foundEndedAuction = true;
        const auctionId = auction.uid;
        const snapshot = await auctionsRef.child(auctionId).get();

        if (snapshot.exists()) {
          console.log(`Auktion ${auctionId} wurde bereits gespeichert. Überspringe.`);
        } else {
          if (!auction.bids) {
            console.log(`Auktion ${auctionId} wird übersprungen (keine Gebote).`);
            continue;
          }
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
      console.log('Keine beendeten Auktionen in der aktuellen Liste gefunden.');
    }

    // Update der JSON-Datei auf GitHub
    const allEndedAuctionsSnapshot = await auctionsRef.get();
    if (allEndedAuctionsSnapshot.exists()) {
        fs.writeFileSync('auction-history.json', JSON.stringify(allEndedAuctionsSnapshot.val(), null, 2));
        console.log('auction-history.json wurde erfolgreich erstellt/aktualisiert.');
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
