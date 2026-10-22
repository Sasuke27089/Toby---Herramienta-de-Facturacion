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