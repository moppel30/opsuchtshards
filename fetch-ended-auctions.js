const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_AUCTIONS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://auctionpricehistory-default-rtdb.europe-west1.firebasedatabase.app/"
});

const db = admin.database();
const lastActiveAuctionsSnapshotRef = db.ref('lastActiveAuctionsSnapshot');

async function trackEndedAuctions() {
  try {
    console.log('Starte Auktions-Tracking-Lauf...');

    // 1. Aktuelle und letzte aktive Auktionen laden
    const currentActiveResponse = await axios.get('https://api.opsucht.net/auctions/active');
    const currentActiveAuctionsArray = currentActiveResponse.data || [];
    const currentActiveAuctionsMap = new Map(currentActiveAuctionsArray.map(a => [a.uid, a]));
    console.log(`Aktuell aktive Auktionen gefunden: ${currentActiveAuctionsArray.length}`);

    const lastActiveSnapshot = await lastActiveAuctionsSnapshotRef.get();
    const lastActiveAuctionsMap = new Map();
    if (lastActiveSnapshot.exists()) {
      lastActiveSnapshot.val().forEach(a => lastActiveAuctionsMap.set(a.uid, a));
    }
    console.log(`Letzte aktive Auktionen aus Firebase geladen: ${lastActiveAuctionsMap.size}`);

    // KORREKTUR: Manuelle Berechnung der deutschen Zeit (CEST = UTC+2)
    const now_utc = new Date();
    const now_german = new Date(now_utc.getTime() + (2 * 60 * 60 * 1000));
    
    // VERBESSERTES LOGGING:
    console.log(`================ ZEIT-CHECK ================`);
    console.log(`UTC-Zeit (Server): ${now_utc.toUTCString()}`);
    console.log(`Deutsche Zeit (berechnet): ${now_german.toUTCString().replace('GMT', 'CEST')}`);
    console.log(`============================================`);

    // 2. Beendete Auktionen identifizieren
    let newlyEndedAuctions = [];
    if (lastActiveAuctionsMap.size > 0) {
      for (const [uid, auction] of lastActiveAuctionsMap.entries()) {
        if (!currentActiveAuctionsMap.has(uid)) {
          const endTime = new Date(auction.endTime);
          // Vergleiche die Endzeit mit unserer berechneten deutschen Zeit
          if (endTime < now_german) {
            newlyEndedAuctions.push(auction);
          }
        }
      }
    }
    console.log(`Neu beendete Auktionen identifiziert: ${newlyEndedAuctions.length}`);

    // 3. Lade die existierende Auktionshistorie
    let history = {};
    try {
      if (fs.existsSync('auction-history.json')) {
        history = JSON.parse(fs.readFileSync('auction-history.json', 'utf8'));
      }
    } catch (e) {
      console.log('auction-history.json nicht gefunden, starte neue Historie.');
    }

    // 4. Verarbeite die neu beendeten Auktionen
    let changesMade = false;
    for (const auction of newlyEndedAuctions) {
      if (!auction.bids) {
        console.log(`Auktion ${auction.uid} wird übersprungen (keine Gebote).`);
        continue;
      }

      const itemName = auction.item.displayName || auction.item.material;
      const saleData = {
        endTime: auction.endTime,
        finalPrice: auction.currentBid
      };

      if (!history[itemName]) {
        history[itemName] = [];
      }
      
      history[itemName].push(saleData);
      changesMade = true;
      console.log(`Verkauf von "${itemName}" für ${saleData.finalPrice} zur Historie hinzugefügt.`);
    }

    // 5. Schreibe die aktualisierte Historie zurück
    if (changesMade) {
      fs.writeFileSync('auction-history.json', JSON.stringify(history, null, 2));
      console.log('auction-history.json wurde erfolgreich aktualisiert.');
    } else {
      console.log('Keine neuen Verkäufe zum Speichern.');
    }

    // 6. Aktuellen Zustand für den nächsten Lauf speichern
    await lastActiveAuctionsSnapshotRef.set(currentActiveAuctionsArray);
    console.log('Aktueller Snapshot für den nächsten Lauf gespeichert.');

  } catch (error) {
    console.error('Ein Fehler ist aufgetreten:', error.message);
    process.exit(1);
  } finally {
    await db.goOffline();
    process.exit(0);
  }
}

trackEndedAuctions();
