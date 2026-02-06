const App = {
    auctionSortMode: "END",
    auctionCategoryFilter: "Alle",
    marketPrices: {},
    marketItems: [],
    auctionsData: [],
    shardRates: [],
    shardHistory: {}, // Hält die geladene Shard-Historie
    currentItem: null,
    currentItemType: null,
    chart: null,
    uuidCache: JSON.parse(localStorage.getItem('opsucht_uuid_cache') || '{}'),
    skinCache: JSON.parse(localStorage.getItem('opsucht_skin_cache') || '{}'),
    matrixAnimationId: null,
    timerInterval: null,
    selectedPlayerUuid: null,
    previousState: null, // Merkt sich den Zustand vor dem Aufruf eines Spielerprofils
    scheduledNotifications: {}, // Speichert geplante Auktions-Benachrichtigungen
  };

  // --- Firebase Konfiguration NUR für den Besucherzähler ---
  const firebaseConfig = {
    apiKey: "AIzaSyCyjv3kl1FKh8EGztS6Fimox-9BvqFsihc",
    authDomain: "visitor-counter-4ce96.firebaseapp.com",
    databaseURL: "https://visitor-counter-4ce96-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "visitor-counter-4ce96",
    storageBucket: "visitor-counter-4ce96.firebasestorage.app",
    messagingSenderId: "434296501874",
    appId: "1:434296501874:web:76f948239d7bab1a04f4eb",
    measurementId: "G-3YZ0GPYCTR"
  };

  // Initialisiere Firebase NUR für den Besucherzähler
  const app = firebase.initializeApp(firebaseConfig);
  const database = firebase.database();


  function showSection(id) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tabs button[onclick="showSection('${id}')"]`).classList.add('active');

    const rainContainer = document.getElementById('rain-container');
    const matrixCanvas = document.getElementById('matrix-canvas');

    stopMatrixAnimation();
    rainContainer.style.display = 'none';
    matrixCanvas.style.display = 'none';

    // Setze die Animation für alle Karten zurück, damit sie neu starten kann
    document.querySelectorAll('.card.animated').forEach(card => {
      card.classList.remove('animated');
      card.style.animationDelay = '';
    });

    if (id === 'about') {
      matrixCanvas.style.display = 'block';
      startMatrixAnimation();
    } else {
      rainContainer.style.display = 'block';
      createImageRain(id);
      // Starte die Animation nur für den jetzt sichtbaren Bereich
      animateCardsWave(document.getElementById(id)); // This line is key
    }
  }

  function openModal() {
    const modal = document.getElementById("chartModal");
    modal.classList.add("show");
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', handleEscKey);
  }

  function closeModal() {
    const modal = document.getElementById("chartModal");
    modal.classList.remove("show");
    document.body.classList.remove('modal-open');

    setTimeout(() => {
      App.currentItem = null;
      if (App.chart) {
        App.chart.destroy();
        App.chart = null;
      }
    }, 300);
    window.removeEventListener('keydown', handleEscKey);
  }

  function handleEscKey(event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  function openImpressumModal() {
    const modal = document.getElementById("impressumModal");
    modal.classList.add("show");
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', handleImpressumEscKey);
  }

  function closeImpressumModal() {
    const modal = document.getElementById("impressumModal");
    modal.classList.remove("show");
    document.body.classList.remove('modal-open');
    window.removeEventListener('keydown', handleImpressumEscKey);
  }

  function handleImpressumEscKey(event) {
    if (event.key === 'Escape') closeImpressumModal();
  }

  function setAuctionSort(mode) {
    App.auctionSortMode = mode;
    renderAuctions();
  }

  async function uuidToUsername(uuid) {
    if (!uuid) return "-";
    let username = App.uuidCache[uuid];
    if (username) return username;

    try {
      const res = await fetch(`https://playerdb.co/api/player/minecraft/${uuid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          username = data.data.player.username;
          App.uuidCache[uuid] = username;
          localStorage.setItem('opsucht_uuid_cache', JSON.stringify(App.uuidCache));
          return username;
        }
      }
    } catch (e) {}

    try {
      if (uuid.startsWith('00000000-0000-0000-')) {
        const hexPart = uuid.substring(19).replace(/-/g, '');
        const xuid = BigInt('0x' + hexPart).toString();
        const gamertagRes = await fetch(`https://api.geysermc.org/v2/xbox/gamertag/${xuid}`);
        if (gamertagRes.ok) {
          const gamertagData = await gamertagRes.json();
          if (gamertagData.gamertag) {
            username = `.${gamertagData.gamertag}`;
            App.uuidCache[uuid] = username;
            localStorage.setItem('opsucht_uuid_cache', JSON.stringify(App.uuidCache));
            return username;
          }
        }
      }
    } catch (e) {}

    username = "privat";
    App.uuidCache[uuid] = username;
    localStorage.setItem('opsucht_uuid_cache', JSON.stringify(App.uuidCache));
    return username;
  }

  async function loadMarket() {
    try {
      const [prices, items] = await Promise.all([
        fetch("https://api.opsucht.net/market/prices").then(res => res.json()),
        fetch("https://api.opsucht.net/market/items").then(res => res.json())
      ]);
      App.marketPrices = prices;
      App.marketItems = items;
    } catch (error) {
      console.error("Fehler beim Laden der Marktdaten:", error);
    }
    document.querySelector('#tab-market .loading-spinner')?.remove();
  }

  async function renderMarket() {
    const container = document.getElementById("marketContainer");
    const search = document.getElementById("searchMarket").value.toLowerCase();
    container.innerHTML = `<div class="content-loader"><span class="loading-spinner" style="width: 2em; height: 2em;"></span><span>Lade Markt...</span></div>`;

    // Gib dem Browser einen Moment Zeit, den Loader zu rendern
    await new Promise(resolve => requestAnimationFrame(resolve));

    container.innerHTML = "";

    for (const category in App.marketPrices) {
      const itemsInCategory = Object.keys(App.marketPrices[category])
        .filter(material => material.toLowerCase().includes(search) || category.toLowerCase().includes(search));

      if (itemsInCategory.length === 0) continue;

      const h2 = document.createElement("h2");
      h2.textContent = category;
      container.appendChild(h2);

      const grid = document.createElement("div");
      grid.className = "grid";

      for (const material of itemsInCategory) {
        const item = App.marketItems.find(i => i.material === material);
        if (!item) continue;

        const orders = App.marketPrices[category][material];
        const buyOrder = orders.find(o => o.orderSide === "BUY") || {};
        const sellOrder = orders.find(o => o.orderSide === "SELL") || {};

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
                <img src="${item.icon}" alt="${material}" loading="lazy">
                <h3>${material}</h3>
                <div class="price-info"><span class="buy">BUY:</span> ${buyOrder.price ?? "-"} (${buyOrder.activeOrders ?? 0})</div>
                <div class="price-info"><span class="sell">SELL:</span> ${sellOrder.price ?? "-"} (${sellOrder.activeOrders ?? 0})</div>
            `;
        card.onclick = () => openChart(material, 'market');
        grid.appendChild(card);
      }
      container.appendChild(grid);
    }
    animateCardsWave(document.getElementById('market'));
  }

  async function loadAuctions() {
    try {
      App.auctionsData = await (await fetch("https://api.opsucht.net/auctions/active")).json();
    } catch (error) {
      console.error("Fehler beim Laden der Auktionsdaten:", error);
    }
    document.querySelector('#tab-auctions .loading-spinner')?.remove();
  }

  function getAuctionItemIcon(item) {
    const displayName = item.displayName ?? item.material;
    const material = item.material;
    let iconUrl = item.icon;
    if (!iconUrl || iconUrl.includes("NONE")) {
      const customIconEntry = customAuctionIcons[displayName];
      if (typeof customIconEntry === 'object' && customIconEntry !== null) {
        iconUrl = customIconEntry[material] || 'https://mcdf.wiki.gg/images/Barrier.png?ff8ff1';
      } else {
        iconUrl = customIconEntry || 'https://mcdf.wiki.gg/images/Barrier.png?ff8ff1';
      }
    }
    return iconUrl;
  }

  // --- Auktions-Kategorien direkt aus der API ---
  // Versucht zuerst auction.category, dann auction.item.category,
  // fällt sonst auf "Unkategorisiert" zurück.
  function getAuctionCategoryKey(auction) {
    if (!auction) return "Unkategorisiert";
    if (auction.category) return auction.category;
    if (auction.item && auction.item.category) return auction.item.category;
    return "Unkategorisiert";
  }

  function getAuctionCategoryLabel(categoryKey) {
    if (!categoryKey) return "Unkategorisiert";
    return categoryKey.replace(/_/g, " ");
  }

  async function setAuctionFilter(category) {
    App.auctionCategoryFilter = category;
    document.querySelectorAll('#auction-filters button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });

    const sortSelect = document.getElementById('auctionSortSelect');
    if (category === 'Spieler') {
      // Spezifische Sortieroptionen für den Spieler-Tab
      sortSelect.innerHTML = `
        <option value="MOST_AUCTIONS">Meiste Auktionen</option>
        <option value="MOST_BIDS">Meiste Gebote</option>
      `;
      App.auctionSortMode = 'MOST_AUCTIONS'; // Standard-Sortierung für Spieler
    } else {
      // Standard-Sortieroptionen für alle anderen Tabs
      sortSelect.innerHTML = `
        <option value="END">Bald endend</option><option value="NEW">Neueste</option><option value="PRICE_HIGH">Höchster Preis</option><option value="PRICE_LOW">Niedrigster Preis</option><option value="BIDS_HIGH">Meiste Gebote</option>
      `;
      if (['MOST_AUCTIONS', 'MOST_BIDS'].includes(App.auctionSortMode)) {
        App.auctionSortMode = 'END'; // Zurück zum Standard, wenn wir von Spielern wechseln
      }
    }
    sortSelect.value = App.auctionSortMode;

    document.getElementById('auction-filters-mobile').value = category;
    renderAuctions();
  }

  function setupAuctionFilters() {
    const filterContainer = document.getElementById('auction-filters');
    const mobileFilterContainer = document.getElementById('auction-filters-mobile');
    filterContainer.innerHTML = '';
    mobileFilterContainer.innerHTML = '';

    // Basis-Tabs
    const categories = ["Alle", "Spieler"];

    // Kategorien dynamisch aus den Auktionsdaten aufbauen
    const apiCategoryKeys = new Set();
    App.auctionsData.forEach(a => {
      const key = getAuctionCategoryKey(a);
      apiCategoryKeys.add(key);
    });

    const sortedApiCategories = Array.from(apiCategoryKeys)
      .filter(key => key !== "Unkategorisiert") // "Unkategorisiert" aus Filtern entfernen, da "Alle" dasselbe macht
      .sort((a, b) =>
        getAuctionCategoryLabel(a).localeCompare(getAuctionCategoryLabel(b), 'de-DE')
      );

    categories.push(...sortedApiCategories);

    categories.forEach(catKey => {
      const isSpecial = catKey === "Alle" || catKey === "Spieler";
      const label = isSpecial ? catKey : getAuctionCategoryLabel(catKey);

      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.category = catKey;
      if (catKey === App.auctionCategoryFilter) btn.classList.add('active');
      btn.onclick = () => setAuctionFilter(catKey);
      filterContainer.appendChild(btn);

      const option = document.createElement('option');
      option.value = catKey;
      option.textContent = label;
      if (catKey === App.auctionCategoryFilter) option.selected = true;
      mobileFilterContainer.appendChild(option);
    });
  }

  function animateCardsWave(sectionElement) {
    // Finde alle Grids innerhalb der spezifischen Sektion oder das Element selbst, wenn es ein Grid ist
    let grids;
    if (sectionElement.classList.contains('grid')) {
      grids = [sectionElement];
    } else {
      grids = sectionElement.querySelectorAll('.grid');
    }

    grids.forEach(grid => {
      const cards = Array.from(grid.querySelectorAll('.card:not(.animated)'));
      if (cards.length === 0) return;

      // Get the number of columns in the grid
      const gridComputedStyle = window.getComputedStyle(grid);
      const gridTemplateColumns = gridComputedStyle.getPropertyValue('grid-template-columns');
      const numColumns = gridTemplateColumns.split(' ').length;

      cards.forEach((card, index) => {
        // Calculate row and column for each card
        const col = index % numColumns;
        const row = Math.floor(index / numColumns);

        // Calculate delay based on column and row to create a wave effect
        // The wave moves primarily left-to-right, with a smaller top-to-bottom delay.
        const delay = (col * 0.1) + (row * 0.05);

        card.style.animationDelay = `${delay}s`;
        card.classList.add('animated');
      });
    });
  }

  function createPlayerCard(uuid, username) {
    const card = document.createElement("div");
    card.className = "card";

    const ownedAuctions = App.auctionsData.filter(a => a.seller === uuid).length;
    const bids = App.auctionsData.filter(a => a.bids && uuid in a.bids).length;

    const match = username.match(/[a-zA-Z]/);
    const initial = match ? match[0].toUpperCase() : '?';

    card.innerHTML = `
        <div class="player-initial-avatar">${initial}</div>
        <h3>${username}</h3>
        <div class="price-info"><span>Auktionen:</span> ${ownedAuctions}</div>
        <div class="price-info"><span>Gebote:</span> ${bids}</div>
    `;

    card.onclick = () => {
      App.selectedPlayerUuid = uuid;
      App.previousState = { type: 'player_list', category: App.auctionCategoryFilter }; // Merken, dass wir von der Spielerliste kommen
      renderAuctions();
    };

    return card;
  }

  function sortAuctionsByMode(a, b) {
    switch (App.auctionSortMode) {
      case 'NEW':
        return new Date(b.startTime) - new Date(a.startTime);
      case 'PRICE_HIGH':
        return (b.currentBid ?? b.startBid) - (a.currentBid ?? a.startBid);
      case 'PRICE_LOW':
        return (a.currentBid ?? a.startBid) - (b.currentBid ?? b.startBid);
      case 'END':
      default:
        return new Date(a.endTime) - new Date(b.endTime);
      case 'BIDS_HIGH':
        return (b.bids ? Object.keys(b.bids).length : 0) - (a.bids ? Object.keys(a.bids).length : 0);
    }
  }

  async function renderAuctions() {
    const container = document.getElementById("auctionContainer");
    const search = document.getElementById("searchAuctions").value.toLowerCase();
    container.innerHTML = `<div class="content-loader"><span class="loading-spinner" style="width: 2em; height: 2em;"></span><span>Lade Auktionen...</span></div>`;

    // Gib dem Browser einen Moment Zeit, den Loader zu rendern
    await new Promise(resolve => requestAnimationFrame(resolve));

    container.innerHTML = "";


    if (App.selectedPlayerUuid) {
      document.body.classList.add('player-profile-view');

      // Stelle sicher, dass die Sortieroptionen für Auktionen (nicht Spieler) angezeigt werden
      const sortSelect = document.getElementById('auctionSortSelect');
      if (!sortSelect.querySelector('option[value="END"]')) {
        sortSelect.innerHTML = `
          <option value="END">Bald endend</option><option value="NEW">Neueste</option><option value="PRICE_HIGH">Höchster Preis</option><option value="PRICE_LOW">Niedrigster Preis</option>
        `;
        App.auctionSortMode = 'END';
        sortSelect.value = 'END';
      }

      const backButton = document.createElement('button');
      backButton.textContent = 'Zurück';
      backButton.style.marginBottom = '1.5rem';
      backButton.onclick = () => {
        // Entferne die Klasse, wenn wir die Spieleransicht verlassen
        document.body.classList.remove('player-profile-view');
        App.selectedPlayerUuid = null;
        if (App.previousState?.type === 'auction_modal') {
          renderAuctions(); // Erst die Auktionsansicht rendern
          setTimeout(() => openAuctionChart(App.previousState.auction), 10); // Dann das Modal öffnen
        } else if (App.previousState?.type === 'player_list') {
          setAuctionFilter(App.previousState.category); // Stellt den Filter wieder her und rendert neu
        } else { // Default: zurück zur Auktions- oder Spielerliste
          renderAuctions();
        }
      };
      container.appendChild(backButton);

      // Filtere die Auktionen des Spielers basierend auf der Suche
      const playerAuctions = App.auctionsData.filter(a => {
        const isOwner = a.seller === App.selectedPlayerUuid;
        const hasBid = a.bids && App.selectedPlayerUuid in a.bids;
        const displayName = a.item.displayName?.toLowerCase() ?? '';
        const material = a.item.material?.toLowerCase() ?? '';
        const matchesSearch = displayName.includes(search) || material.includes(search);
        return (isOwner || hasBid) && matchesSearch;
      });
      const ownedAuctions = playerAuctions.filter(a => a.seller === App.selectedPlayerUuid);
      const biddedAuctions = playerAuctions.filter(a => a.bids && App.selectedPlayerUuid in a.bids);

      if (ownedAuctions.length > 0) {
        const h2 = document.createElement("h2");
        h2.textContent = "Eigene Auktionen";
        container.appendChild(h2);
        const grid = document.createElement("div");
        grid.className = "grid";
        ownedAuctions.sort(sortAuctionsByMode).forEach(auction => grid.appendChild(createAuctionCard(auction)));
        container.appendChild(grid);
      }

      if (biddedAuctions.length > 0) {
        const h2 = document.createElement("h2");
        h2.textContent = "Gebote auf";
        container.appendChild(h2);
        const grid = document.createElement("div");
        grid.className = "grid";
        biddedAuctions.sort(sortAuctionsByMode).forEach(auction => {
          const card = createAuctionCard(auction);
          const playerBid = auction.bids[App.selectedPlayerUuid];
          const bidInfo = document.createElement('div');
          bidInfo.className = 'price-info';
          bidInfo.innerHTML = `<span style="color: var(--accent-color1);">Gebot:</span> ${playerBid}`;
          card.appendChild(bidInfo);
          grid.appendChild(card);
        });
        container.appendChild(grid);
      }

      animateCardsWave(document.getElementById('auctions'));
      return;
    }
    // Stelle sicher, dass die Klasse entfernt wird, wenn keine Spieleransicht aktiv ist
    document.body.classList.remove('player-profile-view');

    if (App.auctionCategoryFilter === 'Spieler') {
      const search = document.getElementById("searchAuctions").value.toLowerCase();
      const playerUuids = new Set();
      App.auctionsData.forEach(a => {
        if (a.seller) playerUuids.add(a.seller);
        if (a.bids) Object.keys(a.bids).forEach(uuid => playerUuids.add(uuid));
      });

      const grid = document.createElement("div");
      grid.className = "grid";
      container.appendChild(grid);

      // Lade alle Spielerdaten (Name, Auktionsanzahl, Gebotsanzahl)
      Promise.all(Array.from(playerUuids).map(async (uuid) => {
        const username = await uuidToUsername(uuid);
        const ownedAuctions = App.auctionsData.filter(a => a.seller === uuid).length;
        const bids = App.auctionsData.filter(a => a.bids && uuid in a.bids).length;
        return { uuid, username, ownedAuctions, bids };
      })).then(players => {
        // Sortiere die Spieler basierend auf dem ausgewählten Modus
        players.sort((a, b) => {
          if (App.auctionSortMode === 'MOST_BIDS') {
            return b.bids - a.bids;
          }
          // Standard: 'MOST_AUCTIONS'
          return b.ownedAuctions - a.ownedAuctions;
        });

        // Filtere nach der Suche
        const filteredPlayers = players.filter(player => {
          const searchableName = player.username.toLowerCase().replace(/^\./, '');
          return searchableName.includes(search);
        });

        // Erstelle die Karten
        filteredPlayers.forEach(player => {
          const card = createPlayerCard(player.uuid, player.username);
          grid.appendChild(card);
        });

        // Starte die Wellen-Animation, nachdem alle Karten im DOM sind.
        animateCardsWave(document.getElementById('auctions'));
      }).catch(error => {
        console.error("Fehler beim Laden der Spieler-Karten:", error);
        container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">Spieler konnten nicht geladen werden.</p>`;
      });
      return;
    }

    // Zuerst nur nach Suchbegriff filtern (Name, Material, Kategorie)
    const baseAuctions = App.auctionsData.filter(a => {
      const displayName = a.item.displayName?.toLowerCase() ?? "";
      const material = a.item.material?.toLowerCase() ?? "";
      const categoryKey = getAuctionCategoryKey(a).toLowerCase();
      const categoryLabel = getAuctionCategoryLabel(getAuctionCategoryKey(a)).toLowerCase();

      const matchesSearch =
        displayName.includes(search) ||
        material.includes(search) ||
        categoryKey.includes(search) ||
        categoryLabel.includes(search);

      return matchesSearch;
    });

    // Nach ausgewählter Kategorie filtern:
    // - \"Alle\"  → alle Auktionen
    // - sonst    → nur Auktionen mit dieser API-Kategorie
    const filteredAuctions = baseAuctions.filter(a =>
      App.auctionCategoryFilter === 'Alle' ||
      getAuctionCategoryKey(a) === App.auctionCategoryFilter
    );
    filteredAuctions.sort(sortAuctionsByMode);

    // Immer ein einziges Grid ohne Kategorie-Überschriften rendern
    const grid = document.createElement("div");
    grid.className = "grid";
    filteredAuctions.forEach(auction => {
      const card = createAuctionCard(auction);
      grid.appendChild(card);
    });
    container.appendChild(grid);

    animateCardsWave(document.getElementById('auctions'));
  }

  function formatCardPrice(price) {
    if (price >= 1000000) {
      return Math.round(price / 1000000) + 'M';
    }
    return Math.floor(price).toLocaleString('de-DE');
  }

  function createAuctionCard(auction) {
    const displayName = auction.item.displayName ?? auction.item.material;
    const iconUrl = getAuctionItemIcon(auction.item);
    const bidCount = auction.bids ? Object.keys(auction.bids).length : 0;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
            <img src="${iconUrl}" alt="${displayName}" loading="lazy" onerror="this.src='https://mcdf.wiki.gg/images/Barrier.png?ff8ff1'">
            <h3>${displayName}</h3>
            <div class="price-info"><span class="buy">Start:</span> ${formatCardPrice(auction.startBid)}</div>
            <div class="price-info"><span class="sell">Aktuell:</span> ${formatCardPrice(auction.currentBid ?? auction.startBid)}</div>
            <div class="price-info"><span style="color: var(--text-secondary)">Gebote:</span> ${bidCount}</div>
            <div class="price-info"><span style="color: var(--text-secondary)">Menge:</span> ${auction.item.amount}</div>
            <div class="price-info auction-timer" data-end-time="${auction.endTime}">Lädt...</div>
        `;
    card.onclick = () => openAuctionChart(auction);
    return card;
  }

  async function loadShards() {
    try {
      const ratesPromise = fetch("https://api.opsucht.net/merchant/rates").then(res => res.json());
      const historyPromise = fetch("https://cdn.jsdelivr.net/gh/moppel30/opsuchtshards@main/shard-history.json").then(res => res.json());

      const [rates, history] = await Promise.all([ratesPromise, historyPromise]);

      App.shardRates = rates;
      App.shardHistory = history || {};

    } catch (error) {
      console.error("Fehler beim Laden der Shard-Daten:", error);
      App.shardRates = [];
      App.shardHistory = {};
    }
    document.querySelector('#tab-shards .loading-spinner')?.remove();
  }

  function parseShardItem(source) {
    if (source.includes("item_name")) {
      try {
        const itemNameMatch = source.match(/item_name='([^']*)'/);
        if (itemNameMatch && itemNameMatch[1]) {
          const itemDetails = JSON.parse(itemNameMatch[1]);
          if (itemDetails.extra && itemDetails.extra[0] && itemDetails.extra[0].text) {
            return { name: itemDetails.extra[0].text, isCustom: true, material: null };
          }
        }
      } catch (e) {
        console.error('Fehler beim Parsen des item_name für:', source, e);
      }
    }
    return { name: source.replace(/_/g, ' '), isCustom: false, material: source };
  }

  async function renderShards() {
    const container = document.getElementById("shardsContainer");
    const search = document.getElementById("searchShards").value.toLowerCase();
    container.innerHTML = `<div class="content-loader"><span class="loading-spinner" style="width: 2em; height: 2em;"></span><span>Lade Shards...</span></div>`;

    // Gib dem Browser einen Moment Zeit, den Loader zu rendern
    await new Promise(resolve => requestAnimationFrame(resolve));

    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "grid";

    const filteredRates = App.shardRates.filter(rate => {
      const itemInfo = parseShardItem(rate.source);
      return itemInfo.name.toLowerCase().includes(search);
    });


    for (const rate of filteredRates) {
      const itemInfo = parseShardItem(rate.source);
      let icon = 'https://mcdf.wiki.gg/images/Barrier.png?ff8ff1';

      if (itemInfo.isCustom) {
        icon = customAuctionIcons[itemInfo.name] || icon;
      } else {
        const marketItem = App.marketItems.find(item => item.material.toLowerCase() === itemInfo.material.toLowerCase());
        if (marketItem) {
          icon = marketItem.icon;
        }
      }

      const card = document.createElement("div");
      card.className = "card";
      card.style.cursor = "pointer";

      card.innerHTML = `
            <img src="${icon}" alt="${itemInfo.name}">
            <h3>${itemInfo.name}</h3>
            <div class="price-info">
                Wert: <span style="color: #34D399; font-weight: bold;">${parseFloat(rate.exchangeRate).toFixed(2)}</span> Shards
            </div>
        `;
      card.onclick = () => openChart(itemInfo.name, 'shards');
      grid.appendChild(card);
    }
    container.appendChild(grid);
    animateCardsWave(document.getElementById('shards'));
  }

  async function loadHistory(period, material, type) {
    let historyData;
    if (type === 'market') {
        const data = await (await fetch(`https://api.opsucht.net/market/history/${material}`)).json();
        historyData = data[period];
        
        // Berechne und zeige den Durchschnittspreis für Markt-Diagramme
        if (historyData && historyData.length > 0) {
            const prices = historyData.map(h => h.avgPrice).filter(p => p != null);
            if (prices.length > 0) {
                const sum = prices.reduce((acc, price) => acc + price, 0);
                const avgPrice = Math.round(sum / prices.length);
                
                // Entferne alte Durchschnittsanzeige, falls vorhanden
                const oldAvgDisplay = document.getElementById('average-price-display');
                if (oldAvgDisplay) oldAvgDisplay.remove();
                
                // Erstelle und zeige die Durchschnittsanzeige über dem Diagramm
                const chartModal = document.getElementById('chartModal');
                const chartContainer = chartModal.querySelector('.chart-container');
                const avgDisplay = document.createElement('div');
                avgDisplay.id = 'average-price-display';
                avgDisplay.style.cssText = 'text-align: center; margin-bottom: 1rem; font-size: 1.1em; color: var(--text-primary);';
                avgDisplay.innerHTML = `<span>⌀ Durchschnitt:</span> <span style="color: var(--accent-color1); font-weight: bold;">${avgPrice.toLocaleString('de-DE')}</span>`;
                chartContainer.insertBefore(avgDisplay, chartContainer.querySelector('canvas'));
            }
        }
    } else if (type === 'shards') {
        const allHistory = App.shardHistory;
        let fullHistoryData = Object.entries(allHistory).map(([timestamp, rates]) => {
            const rate = rates.find(r => parseShardItem(r.source).name === material);
            return {
                timestamp: parseInt(timestamp),
                avgPrice: rate ? rate.exchangeRate : null
            };
        }).filter(h => h.avgPrice !== null);

        if (fullHistoryData.length > 2) {
            let filteredHistory = [fullHistoryData[0]];
            for (let i = 1; i < fullHistoryData.length - 1; i++) {
                if (fullHistoryData[i].avgPrice !== filteredHistory[filteredHistory.length - 1].avgPrice) {
                    filteredHistory.push(fullHistoryData[i]);
                }
            }
            filteredHistory.push(fullHistoryData[fullHistoryData.length - 1]);
            historyData = filteredHistory;
        } else {
            historyData = fullHistoryData;
        }

        // Füge den aktuellen Live-Preis hinzu
        const currentRate = App.shardRates.find(r => parseShardItem(r.source).name === material);
        if (currentRate && historyData.length > 0) {
            const lastHistoryPrice = historyData[historyData.length - 1].avgPrice;
            if (currentRate.exchangeRate !== lastHistoryPrice) {
                historyData.push({
                    timestamp: Date.now(),
                    avgPrice: currentRate.exchangeRate
                });
            }
        }
    }

    if (!historyData || historyData.length === 0) {
        console.error("Keine Verlaufsdaten gefunden für:", material);
        const ctx = document.getElementById("priceChart").getContext("2d");
        if (App.chart) App.chart.destroy();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "16px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText("Keine historischen Daten für dieses Item verfügbar.", ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const labels = historyData.map(h => {
      const d = new Date(h.timestamp);
      return d.toLocaleString("de-DE", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    });
    const pricesData = historyData.map(h => h.avgPrice);
    const ctx = document.getElementById("priceChart").getContext("2d");
    if (App.chart) App.chart.destroy();

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color1').trim();

    App.chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data: pricesData, borderColor: accentColor, backgroundColor: accentColor + "33", fill: true, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  function openChart(material, type) {
    App.currentItem = material;
    App.currentItemType = type;
    document.getElementById("modalTitle").textContent = `Preisentwicklung: ${material}`;

    const chartButtons = document.querySelector(".chart-buttons");
    if (type === 'shards') {
        chartButtons.style.display = 'none';
    } else {
        chartButtons.style.display = 'block';
    }

    const chartModal = document.getElementById('chartModal');

    // Verstecke Auktions-spezifische Elemente, falls sie sichtbar sind
    const infoBox = chartModal.querySelector('.auction-info-box');
    if (infoBox) infoBox.style.display = 'none';

    const biddersHeader = chartModal.querySelector('#bidders-header');
    if (biddersHeader) biddersHeader.style.display = 'none';

    const biddersGrid = chartModal.querySelector('#bidders-grid');
    if (biddersGrid) biddersGrid.style.display = 'none';

    // Entferne den Auktions-Erinnerungs-Button, falls er existiert (nur für Markt/Shards relevant)
    const notificationBtn = chartModal.querySelector('#notificationBtn');
    if (notificationBtn) notificationBtn.remove();

    // Entferne alte Durchschnittsanzeige, falls vorhanden
    const oldAvgDisplay = chartModal.querySelector('#average-price-display');
    if (oldAvgDisplay) oldAvgDisplay.remove();

    // Stelle sicher, dass der Chart-Container sichtbar ist
    const chartContainer = chartModal.querySelector('.chart-container');
    chartContainer.style.display = 'block';

    // Entferne den "Keine Gebote"-Platzhalter, falls er existiert
    const placeholder = chartModal.querySelector('.no-bids-placeholder');
    if (placeholder) placeholder.remove();

    openModal();
    loadHistory(type === 'shards' ? '' : 'DAILY', material, type);
  }

  async function openAuctionChart(auction) {
    // Merke dir die Auktion nur als letzten Zustand, wenn wir nicht gerade in einem Spielerprofil sind.
    if (!App.selectedPlayerUuid) {
      App.previousState = { type: 'auction_modal', auction: auction };
    }
    App.currentItem = null;
    document.getElementById("modalTitle").textContent = auction.item.displayName ?? auction.item.material;
    document.querySelector(".chart-buttons").style.display = "none";

    const chartModal = document.getElementById('chartModal');

    // Bereinige alte "Keine Gebote"-Anzeige
    const oldPlaceholder = chartModal.querySelector('.no-bids-placeholder');
    if (oldPlaceholder) oldPlaceholder.remove();

    // Zeige Chart-Container wieder an, falls er versteckt war
    const chartContainer = chartModal.querySelector('.chart-container');
    chartContainer.style.display = 'block';

    // Zeige die Info-Box wieder an, falls sie versteckt war
    const infoBoxToDisplay = chartModal.querySelector('.auction-info-box');
    if (infoBoxToDisplay) infoBoxToDisplay.style.display = 'grid';

    const modalContent = chartModal.querySelector(".modal-content");
    let infoBox = modalContent.querySelector(".auction-info-box");
    if (!infoBox) {
      infoBox = document.createElement("div");
      infoBox.className = "auction-info-box";
      modalContent.insertBefore(infoBox, modalContent.querySelector('.chart-container'));
    }

    const sellerName = auction.seller ? await uuidToUsername(auction.seller) : "-";
    const sellerInitial = sellerName.match(/[a-zA-Z]/) ? sellerName.match(/[a-zA-Z]/)[0].toUpperCase() : '?';

    infoBox.innerHTML = `
      <div class="info-item">
        <strong>Verkäufer</strong>
        <span class="seller-profile">
          <div class="player-initial-avatar" style="width: 24px; height: 24px; font-size: 1rem; margin: 0;">${sellerInitial}</div>
          ${sellerName}
        </span>
      </div>
      <div class="info-item"><strong>Startzeit</strong> ${new Date(auction.startTime).toLocaleString("de-DE")}</div>
      <div class="info-item"><strong>Endzeit</strong> ${new Date(auction.endTime).toLocaleString("de-DE")}</div>
      <div class="info-item"><strong>Aktuelles Gebot</strong> <span class="sell">${(auction.currentBid ?? auction.startBid).toLocaleString('de-DE')}</span></div>
    `;

    const sellerProfileEl = infoBox.querySelector('.seller-profile');
    if (sellerProfileEl && auction.seller) {
      sellerProfileEl.onclick = () => {
        closeModal();
        App.previousState = { type: 'auction_modal', auction: auction }; // Zustand vor dem Wechsel merken
        App.selectedPlayerUuid = auction.seller;
        renderAuctions();
      };
      sellerProfileEl.addEventListener('mouseenter', () => sellerProfileEl.style.backgroundColor = 'var(--border)');
      sellerProfileEl.addEventListener('mouseleave', () => sellerProfileEl.style.backgroundColor = 'transparent');
    }

    // Erstelle und platziere den Benachrichtigungs-Button
    let notificationBtn = modalContent.querySelector('#notificationBtn');
    if (notificationBtn) notificationBtn.remove(); // Entferne alten Button

    notificationBtn = document.createElement('button');
    notificationBtn.id = 'notificationBtn';
    notificationBtn.textContent = 'Auktions Erinnerung';
    notificationBtn.style.width = '100%';
    notificationBtn.style.marginBottom = '1rem'; /* Abstand zum Diagramm */
    infoBox.insertAdjacentElement('afterend', notificationBtn);

    setupNotificationButton(auction);

    const bids = auction.bids || {};
    const ctx = document.getElementById("priceChart").getContext("2d");
    if (App.chart) App.chart.destroy();

    if (Object.keys(bids).length === 0) {
      // Zeige Platzhalter, wenn keine Gebote vorhanden sind
      chartContainer.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.className = 'no-bids-placeholder';
      placeholder.innerHTML = `
        <img src="https://i.postimg.cc/7hsNsds9/asdasdasdnannt.png" alt="Keine Gebote" style="max-width: 150px; margin-bottom: 1rem; opacity: 0.5;">
        <p>Noch keine Gebote vorhanden</p>
      `;
      modalContent.insertBefore(placeholder, chartContainer.nextSibling);
    } else {
      // Sortiere von niedrigstem zu höchstem Gebot für das Diagramm
      const sortedBids = Object.entries(bids).sort((a, b) => a[1] - b[1]);
      const playerNames = [], amounts = [];

      for (const [uuid, amount] of sortedBids) {
        playerNames.push(await uuidToUsername(uuid));
        amounts.push(amount);
      }

      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color1').trim();

      const isMobile = window.innerWidth <= 768;

      // Barchart für Gebote
      App.chart = new Chart(ctx, {
        type: "bar",
        data: { labels: playerNames, datasets: [{ data: amounts, borderColor: accentColor, backgroundColor: accentColor + "99" }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, title: { display: !isMobile, text: "Gebotsbetrag" }, ticks: { display: !isMobile } }, // Deaktiviere Y-Achsen-Zahlen & Titel auf Mobilgeräten
            x: { title: { display: true, text: "Spieler" } }
          }
        }
      });
    }

    // Erstelle die Bieter-Karten
    let biddersGrid = modalContent.querySelector('#bidders-grid');
    if (biddersGrid) {
      biddersGrid.remove();
    }
    // Entferne auch die alte Überschrift, falls vorhanden
    const oldBiddersHeader = modalContent.querySelector('#bidders-header');
    if (oldBiddersHeader) {
      oldBiddersHeader.remove();
    }

    // Zeige Bieter an, wenn Gebote vorhanden sind (sortiert von höchstem zu niedrigstem)
    const biddersToShow = Object.entries(bids).sort((a, b) => b[1] - a[1]);
    if (biddersToShow.length > 0) {
      const biddersHeader = document.createElement('h2');
      biddersHeader.id = 'bidders-header'; // ID zum einfachen Entfernen
      biddersHeader.textContent = 'Bieter';
      biddersHeader.style.marginTop = '2rem';
      modalContent.appendChild(biddersHeader);

      biddersGrid = document.createElement('div');
      biddersGrid.className = 'grid';
      biddersGrid.id = 'bidders-grid';

      for (const [uuid, amount] of biddersToShow) {
        const username = await uuidToUsername(uuid);
        const card = createPlayerCard(uuid, username); // createPlayerCard sets a generic onclick
        const bidAmountDiv = document.createElement('div');
        bidAmountDiv.className = 'price-info';
        bidAmountDiv.innerHTML = `Gebot: <span class="sell">${amount.toLocaleString('de-DE')}</span>`;
        // Überschreibe den OnClick-Handler, um das Modal zu schließen und zum Spielerprofil zu wechseln
        card.onclick = () => {
          closeModal();
          App.previousState = { type: 'auction_modal', auction: auction }; // Zustand vor dem Wechsel merken
          App.selectedPlayerUuid = uuid;
          renderAuctions();
        };
        card.appendChild(bidAmountDiv);
        biddersGrid.appendChild(card);
      }
      modalContent.appendChild(biddersGrid);
      animateCardsWave(biddersGrid);
    }

    openModal();
  }

  function setupNotificationButton(auction) {
    const notificationBtn = document.getElementById('notificationBtn');
    const auctionUid = auction.uid;

    // Prüfe, ob bereits eine Benachrichtigung für diese Auktion geplant ist
    if (App.scheduledNotifications[auctionUid]) {
      notificationBtn.classList.add('active');
    } else {
      notificationBtn.classList.remove('active');
    }

    notificationBtn.onclick = () => {
      if (notificationBtn.classList.contains('active')) {
        // Benachrichtigung abbrechen
        clearTimeout(App.scheduledNotifications[auctionUid]);
        delete App.scheduledNotifications[auctionUid];
        notificationBtn.classList.remove('active');
      } else {
        // Erinnerung direkt planen, ohne Benachrichtigungs-Abfrage
        scheduleNotification(auction, notificationBtn);
      }
    };
  }

  function scheduleNotification(auction, btn) {
    const endTime = new Date(auction.endTime);
    const notificationTime = endTime.getTime() - (5 * 60 * 1000); // 5 Minuten vorher
    const now = Date.now();

    if (notificationTime > now) {
      const timeoutId = setTimeout(() => {
        showAuctionNotification(auction);
        delete App.scheduledNotifications[auction.uid];
        const currentBtn = document.getElementById('notificationBtn');
        if (currentBtn) currentBtn.classList.remove('active');
      }, notificationTime - now);

      App.scheduledNotifications[auction.uid] = timeoutId;
      btn.classList.add('active');
    } else {
      alert("Die Auktion endet in weniger als 5 Minuten. Eine Erinnerung kann nicht mehr gesetzt werden.");
    }
  }

  function showAuctionNotification(auction) {
    // Öffne direkt das Auktions-Popup statt einer System-Benachrichtigung
    openAuctionChart(auction);
    new Audio('auction.ogg').play().catch(e => console.error("Fehler beim Abspielen des Sounds:", e));
  }

  function createImageRain(section = 'market') {
    const container = document.getElementById('rain-container');
    container.innerHTML = '';

    let imageUrls = [];
    if (section === 'market') {
      imageUrls = App.marketItems.map(item => item.icon).filter(Boolean);
    } else if (section === 'auctions') {
      Object.values(customAuctionIcons).forEach(value => {
        if (typeof value === 'string') {
          if (value) imageUrls.push(value);
        } else if (typeof value === 'object' && value !== null) {
          imageUrls.push(...Object.values(value).filter(Boolean));
        }
      });
    } else if (section === 'shards' && App.shardRates) {
      const uniqueShardIcons = new Set();
      for (const rate of App.shardRates) {
        const itemInfo = parseShardItem(rate.source);
        let icon = 'https://mcdf.wiki.gg/images/Barrier.png?ff8ff1'; // Default fallback

        if (itemInfo.isCustom) {
          icon = customAuctionIcons[itemInfo.name] || icon;
        } else {
          const marketItem = App.marketItems.find(item => item.material.toLowerCase() === itemInfo.material.toLowerCase());
          if (marketItem) {
            icon = marketItem.icon;
          }
        }
        uniqueShardIcons.add(icon);
      }
      imageUrls = Array.from(uniqueShardIcons);
    }

    const excludedUrl = 'https://i.postimg.cc/d1K5xLLB/1-edition-boosterpack.png';
    imageUrls = imageUrls.filter(url => url !== excludedUrl);

    if (imageUrls.length === 0) return;

    const rainAmount = window.innerWidth < 768 ? 20 : 50;
    for (let i = 0; i < rainAmount; i++) {
      const drop = document.createElement('img');
      drop.src = imageUrls[Math.floor(Math.random() * imageUrls.length)];
      drop.className = 'rain-drop';

      const size = Math.random() * 20 + 20;
      drop.style.width = `${size}px`;
      drop.style.height = `${size}px`;
      drop.style.left = `${Math.random() * 100}vw`;
      drop.style.animationDuration = `${Math.random() * 5 + 5}s`;
      drop.style.animationDelay = `${Math.random() * 10}s`;

      container.appendChild(drop);
    }
  }

  function setupProfileCardInteractions() {
    document.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
        card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
      });
    });
  }

  function startMatrixAnimation() {
    const canvas = document.getElementById('matrix-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%'.split('');
    const fontSize = 10;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);

    function draw() {
      ctx.fillStyle = 'rgba(1, 5, 20, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-color1').trim();
      ctx.font = fontSize + 'px arial';

      for (let i = 0; i < drops.length; i++) {
        const text = letters[Math.floor(Math.random() * letters.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }
    App.matrixAnimationId = setInterval(draw, 33);
  }

  function stopMatrixAnimation() {
    if (App.matrixAnimationId) {
      clearInterval(App.matrixAnimationId);
      App.matrixAnimationId = null;
    }
  }

  function updateAuctionTimers() {
    const now = new Date();
    document.querySelectorAll('.auction-timer').forEach(timerEl => {
      const endTime = new Date(timerEl.dataset.endTime);
      const diff = endTime - now;

      if (diff <= 0) {
        timerEl.textContent = 'Abgelaufen';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeLeftString;
      if (days > 0) {
        timeLeftString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      } else if (hours > 0) {
        timeLeftString = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        timeLeftString = `${minutes}m ${seconds}s`;
      } else {
        timeLeftString = `${seconds}s`;
      }

      // Setze den Inhalt mit dem Emoji und dem rot gefärbten Timer
      timerEl.innerHTML = `⏰ <span style="color: #F87171;">${timeLeftString}</span>`;
    });
  }

  function animateHeadline() {
    const headline = document.querySelector('h1');
    if (!headline) return;

    const emojiSpan = headline.querySelector('span');
    const text = headline.textContent.substring(emojiSpan.textContent.length).trim();

    headline.innerHTML = ''; // Leere die Überschrift
    headline.appendChild(emojiSpan); // Füge das Emoji wieder hinzu
    headline.append(document.createTextNode('\u00A0')); // Füge ein Leerzeichen hinzu

    text.split('').forEach((char, index) => {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = char === ' ' ? '\u00A0' : char; // Ersetze Leerzeichen
      span.style.animationDelay = `${index * 0.03}s`;
      headline.appendChild(span);
    });
  }

  function updateVisitorCounter() {
    const counterRef = database.ref('visits/count');
    counterRef.transaction(function(currentCount) {
      return (currentCount || 0) + 1;
    });
    counterRef.on('value', (snapshot) => {
      const count = snapshot.val();
      document.getElementById('visitor-counter').textContent = `Besucher gesamt: ${count}`;
    });
  }

  async function init() {
    // Lade Daten parallel, aber warte auf alle, bevor es weitergeht.
    // Die Ladeanzeigen werden innerhalb der Ladefunktionen entfernt.
    await Promise.all([loadMarket(), loadAuctions(), loadShards()]);

    setupAuctionFilters();
    setupProfileCardInteractions();
    updateVisitorCounter();

    // Rendere alle Inhalte, nachdem die Daten geladen sind.
    await renderMarket();
    await renderAuctions();
    await renderShards();

    // Starte den globalen Timer für die Auktionen
    if (App.timerInterval) clearInterval(App.timerInterval);
    App.timerInterval = setInterval(updateAuctionTimers, 1000);

    showSection('auctions');
  }

  document.addEventListener('DOMContentLoaded', () => { animateHeadline(); init(); });
