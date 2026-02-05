const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialisiert die Admin-Verbindung zu deinem Firebase-Projekt
admin.initializeApp();

/**
 * Diese Funktion wird automatisch jede Stunde ausgeführt.
 * Sie ruft die Shard-Preise von der OPsucht-API ab und speichert sie
 * mit einem Zeitstempel in deiner Firebase Realtime Database.
 */
exports.saveShardHistory = functions.region("europe-west1").pubsub.schedule("every 1 hours").onRun(async (context) => {
  try {
    // 1. Daten von der API abrufen
    const response = await axios.get("https://api.opsucht.net/merchant/rates");
    const shardRates = response.data;

    if (!shardRates || shardRates.length === 0) {
      console.log("Keine Shard-Preise von der API erhalten.");
      return null;
    }

    // 2. Verbindung zur Datenbank herstellen
    const db = admin.database();
    const ref = db.ref("shardHistory");

    // 3. Zeitstempel erstellen
    const timestamp = Date.now();

    // 4. Daten in der Datenbank unter dem Zeitstempel speichern
    await ref.child(timestamp).set(shardRates);

    console.log("Shard-Verlauf erfolgreich gespeichert für Zeitstempel:", timestamp);
    return null;

  } catch (error) {
    console.error("Fehler beim Speichern des Shard-Verlaufs:", error);
    return null;
  }
});
