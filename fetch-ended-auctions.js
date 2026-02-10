const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_AUCTIONS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://auctionpricehistory-default-rtdb.europe-west1.firebasedatabase.app/"
});

const db = admin.database();

async function trackEndedAuctions() {
  try {
    console.log('Rufe aktive Auktionen von der API ab...');
    const response = await axios.get('https://api.opsucht.net/auctions/active');
    const activeAuctions = response.data;

    if (!activeAuctions) {
      console.log('Keine Daten von der API erhalten.');
      process.exit(0);
    }

    // KORREKTUR: 2 Minuten Toleranz von der aktuellen deutschen Zeit abziehen
    const nowInGermanyRaw = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const nowInGermany = new Date(nowInGermanyRaw.getTime() - (2 * 60 * 1000)); // 2 Minuten abziehen

    console.log(`================ ZEIT-CHECK ================`);
    console.log(`Aktuelle deutsche Zeit (roh): ${nowInGermanyRaw.toLocaleString('de-DE')}`);
    console.log(`Vergleichszeit (-2 Min): ${nowInGermany.toLocaleString('de-DE')}`);
    console.log(`============================================`);

    let changesMade = false;
    
    let history = {};
    try {
      if (fs.existsSync('auction-history.json')) {
        history = JSON.parse(fs.readFileSync('auction-history.json', 'utf8'));
        console.log('Bestehende auction-history.json geladen.');
      }
    } catch (e) {
      console.log('auction-history.json nicht gefunden oder fehlerhaft, starte neue Historie.');
    }

    for (const auction of Object.values(activeAuctions)) {
      const endTime = new Date(auction.endTime);

      if (endTime < nowInGermany) {
        const auctionId = auction.uid;
        const itemName = auction.item.displayName || auction.item.material;
        const isAlreadySaved = history[itemName]?.some(sale => new Date(sale.endTime).getTime() === endTime.getTime());

        if (isAlreadySaved) {
          console.log(`Auktion ${auctionId} für "${itemName}" wurde bereits verarbeitet. Überspringe.`);
          continue;
        }

        if (!auction.highestBidder) {
          console.log(`Auktion ${auctionId} für "${itemName}" wird übersprungen (keine Gebote/kein Käufer).`);
          continue;
        }

        console.log(`Neue beendete Auktion gefunden: ${auctionId} für "${itemName}".`);
        
        const saleData = {
          ...auction,
          finalPrice: auction.currentBid
        };

        if (!history[itemName]) {
          history[itemName] = [];
          console.log(`Neuer Abschnitt für "${itemName}" wird erstellt.`);
        }
        
        history[itemName].push(saleData);
        changesMade = true;
        console.log(`Verkauf von "${itemName}" für ${saleData.finalPrice} an ${saleData.highestBidder} zur Historie hinzugefügt.`);
      }
    }

    if (changesMade) {
      fs.writeFileSync('auction-history.json', JSON.stringify(history, null, 2));
      console.log('auction-history.json wurde erfolgreich aktualisiert.');
    } else {
      console.log('Keine neuen Verkäufe zum Speichern.');
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

