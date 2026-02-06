const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_AUCTIONS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://auctionpricehistory-default-rtdb.europe-west1.firebasedatabase.app/"
});

const db = admin.database();
const endedAuctionsRef = db.ref('endedAuctions');
const lastActiveAuctionsSnapshotRef = db.ref('lastActiveAuctionsSnapshot');

async function trackEndedAuctions() {
  try {
    console.log('Starte Auktions-Tracking-Lauf...');

    // 1. Aktuelle aktive Auktionen von der API abrufen
    console.log('Rufe aktuelle aktive Auktionen von der API ab...');
    const currentActiveResponse = await axios.get('https://api.opsucht.net/auctions/active');
    const currentActiveAuctionsArray = currentActiveResponse.data || [];
    const currentActiveAuctionsMap = new Map(currentActiveAuctionsArray.map(a => [a.uid, a]));
    console.log(`Aktuell aktive Auktionen gefunden: ${currentActiveAuctionsArray.length}`);

    // 2. Aktive Auktionen vom letzten Lauf aus Firebase abrufen
    console.log('Lade letzte aktive Auktionen aus Firebase...');
    const lastActiveSnapshot = await lastActiveAuctionsSnapshotRef.get();
    const lastActiveAuctionsMap = new Map();
    if (lastActiveSnapshot.exists()) {
      const lastActiveAuctionsArray = lastActiveSnapshot.val();
      lastActiveAuctionsArray.forEach(a => lastActiveAuctionsMap.set(a.uid, a));
      console.log(`Letzte aktive Auktionen aus Firebase geladen: ${lastActiveAuctionsMap.size}`);
    } else {
      console.log('Keine letzten aktiven Auktionen in Firebase gefunden (erster Lauf oder Reset).');
    }

    // 3. Beendete Auktionen identifizieren (Diff-Ansatz)
    let newlyEndedAuctions = [];
    if (lastActiveAuctionsMap.size > 0) {
      for (const [uid, auction] of lastActiveAuctionsMap.entries()) {
        if (!currentActiveAuctionsMap.has(uid)) {
          newlyEndedAuctions.push(auction);
        }
      }
    }
    console.log(`Neu beendete Auktionen identifiziert: ${newlyEndedAuctions.length}`);

    // 4. Neu beendete Auktionen in Firebase speichern
    for (const auction of newlyEndedAuctions) {
      const auctionId = auction.uid;
      console.log(`Speichere neu beendete Auktion: ${auctionId}...`);
      await endedAuctionsRef.child(auctionId).set({
        itemName: auction.item.displayName || auction.item.material,
        finalPrice: auction.currentBid,
        endTime: auction.endTime,
        seller: auction.seller,
        recordedAt: Date.now()
      });
      console.log(`Auktion ${auctionId} erfolgreich gespeichert.`);
    }

    // 5. Aktuellen Zustand der aktiven Auktionen für den nächsten Lauf speichern
    console.log('Speichere aktuellen aktiven Auktions-Snapshot für den nächsten Lauf...');
    await lastActiveAuctionsSnapshotRef.set(currentActiveAuctionsArray);
    console.log('Aktueller Snapshot erfolgreich gespeichert.');

    // 6. Gesamte beendete Auktionshistorie in eine JSON-Datei schreiben
    console.log('Lade gesamte beendete Auktionshistorie für die JSON-Datei...');
    const allEndedAuctionsSnapshot = await endedAuctionsRef.get();
    const allEndedAuctionsData = allEndedAuctionsSnapshot.val();
    fs.writeFileSync('auction-history.json', JSON.stringify(allEndedAuctionsData, null, 2));
    console.log('auction-history.json wurde erfolgreich erstellt.');

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
    process.exit(1);
  } finally {
    await db.goOffline();
    process.exit(0);
  }
}

trackEndedAuctions();
