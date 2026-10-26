const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(orders, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'MesaFacil POS',
    message: 'Servidor disponible',
    time: new Date().toISOString()
  });
});

app.get('/api/orders', (_req, res) => {
  res.json({ orders: readOrders() });
});

app.get('/api/product-image', async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query || query.length > 120) {
    return res.status(400).json({
      error: 'Indica un nombre de producto de entre 1 y 120 caracteres.'
    });
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return res.status(503).json({
      error: 'Configura UNSPLASH_ACCESS_KEY en .env.local y reinicia el servidor API.'
    });
  }

  const headers = {
    Authorization: `Client-ID ${accessKey}`,
    'Accept-Version': 'v1'
  };
  const params = new URLSearchParams({
    query,
    per_page: '1',
    orientation: 'squarish'
  });

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?${params}`,
      { headers, signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      console.error(`Unsplash image search failed with HTTP ${response.status}.`);
      return res.status(response.status === 429 ? 429 : 502).json({
        error: response.status === 429
          ? 'Unsplash alcanzó el límite de búsquedas. Intenta más tarde.'
          : `Unsplash rechazó la búsqueda (HTTP ${response.status}).`
      });
    }

    const data = await response.json();
    const photo = data.results?.[0];
    if (!photo) return res.json({ image: null });

    const imageUrl = photo.urls?.small;
    const downloadLocation = photo.links?.download_location;
    const photographerUrl = photo.user?.links?.html;
    const photoUrl = photo.links?.html;
    if (!imageUrl || !downloadLocation || !photographerUrl || !photoUrl) {
      console.error('Unsplash returned an incomplete photo record.');
      return res.status(502).json({
        error: 'Unsplash devolvió una imagen sin los datos de atribución requeridos.'
      });
    }

    const imageHost = new URL(imageUrl).hostname;
    const apiHost = new URL(downloadLocation).hostname;
    const creditHost = new URL(photographerUrl).hostname;
    const sourceHost = new URL(photoUrl).hostname;
    const validUnsplashHost = host =>
      host === 'unsplash.com' || host.endsWith('.unsplash.com');
    if (
      imageHost !== 'images.unsplash.com' ||
      apiHost !== 'api.unsplash.com' ||
      !validUnsplashHost(creditHost) ||
      !validUnsplashHost(sourceHost)
    ) {
      console.error('Unsplash returned an image or tracking URL with an unexpected host.');
      return res.status(502).json({
        error: 'Unsplash devolvió una dirección de imagen no válida.'
      });
    }

    const downloadResponse = await fetch(downloadLocation, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    if (!downloadResponse.ok) {
      console.error(`Unsplash download tracking failed with HTTP ${downloadResponse.status}.`);
      return res.status(502).json({
        error: 'No se pudo registrar la atribución de la imagen con Unsplash.'
      });
    }

    const attributionParams = 'utm_source=mesafacil&utm_medium=referral';
    const withAttribution = url =>
      `${url}${url.includes('?') ? '&' : '?'}${attributionParams}`;

    return res.json({
      image: {
        imageUrl,
        imageCredit: photo.user.name || 'Fotógrafo de Unsplash',
        imageCreditUrl: withAttribution(photographerUrl),
        imageSourceUrl: withAttribution(photoUrl)
      }
    });
  } catch (error) {
    console.error('Unsplash image lookup failed:', error);
    return res.status(502).json({
      error: error.name === 'TimeoutError'
        ? 'La búsqueda de imagen tardó demasiado. Intenta nuevamente.'
        : 'No se pudo conectar con Unsplash para buscar la imagen.'
    });
  }
});

app.post('/api/sync/orders', (req, res) => {
  const incoming = req.body?.orders;

  if (!Array.isArray(incoming)) {
    return res.status(400).json({
      error: 'Envía un arreglo llamado orders.'
    });
  }

  if (incoming.length > 200) {
    return res.status(400).json({
      error: 'Sincroniza como máximo 200 pedidos por envío.'
    });
  }

  const invalid = incoming.some(order =>
    !order ||
    typeof order.id !== 'string' ||
    order.id.length < 1 ||
    order.id.length > 150 ||
    !Number.isInteger(order.tableId) ||
    order.tableId < 1 ||
    !Array.isArray(order.items) ||
    typeof order.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(order.createdAt))
  );

  if (invalid) {
    return res.status(400).json({
      error: 'Pedido inválido. Revisa id, tableId, items y createdAt.'
    });
  }

  const orders = readOrders();
  const knownIds = new Set(orders.map(order => order.id));
  const acceptedIds = [];
  const duplicateIds = [];

  for (const order of incoming) {
    if (knownIds.has(order.id)) {
      duplicateIds.push(order.id);
      continue;
    }

    orders.push({
      id: order.id,
      tableId: order.tableId,
      items: order.items,
      createdAt: order.createdAt,
      receivedAt: new Date().toISOString()
    });

    knownIds.add(order.id);
    acceptedIds.push(order.id);
  }

  saveOrders(orders);

  res.json({
    ok: true,
    acceptedIds,
    duplicateIds,
    message: `Pedidos nuevos recibidos: ${acceptedIds.length}.`
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MesaFácil POS API disponible en el puerto ${PORT}`);
});