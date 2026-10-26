import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import {
  LayoutDashboard, Utensils, Package, ClipboardCheck,
  Settings, Plus, Minus, Trash2, Send, Receipt, Wifi, Pencil,
  Search, X, CheckCircle2, Banknote, CreditCard, Clock3, ArrowLeft,
  ShoppingCart, BookOpenText
} from 'lucide-react';
import './index.css';

const RECEIPT_WIDTH_MM: 80 | 100 = 80;
const timestampNow = () => new Date().toISOString();
const localDateTimeNow = () => new Date().toLocaleString('es-NI', {
  dateStyle: 'short',
  timeStyle: 'short',
});

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  imageUrl?: string;
  imageCredit?: string;
  imageCreditUrl?: string;
  imageSourceUrl?: string;
};

type Item = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  sentQuantity?: number;
  servedQuantity?: number;
};

type TableData = {
  id: number;
  items: Item[];
  sent: boolean;
  paymentPending?: boolean;
};

type InventoryMovement = {
  id: string;
  productId: number;
  productName: string;
  type: 'Compra' | 'Venta' | 'Ajuste';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number | null;
  reason: string;
  createdAt: string;
};

type FloorElement = {
  id: string;
  kind: 'table' | 'bar';
  tableId?: number;
  label: string;
  x: number;
  y: number;
  shape: 'round' | 'square' | 'rectangle';
  material: 'wood' | 'metal';
  section: string;
};

type FloorSection = {
  id: string;
  name: string;
};

type FloorPlan = {
  id: string;
  name: string;
  sections: FloorSection[];
  elements: FloorElement[];
};

type ProductImageResult = {
  imageUrl: string;
  imageCredit: string;
  imageCreditUrl: string;
  imageSourceUrl: string;
};

type RestaurantInfo = {
  name: string;
  legalName: string;
  ruc: string;
  address: string;
  phone: string;
  email: string;
  receiptTitle: string;
  thankYou: string;
  currency: 'NIO' | 'USD';
  paymentInfo: string;
};

const emptyRestaurantInfo: RestaurantInfo = {
  name: '',
  legalName: '',
  ruc: '',
  address: '',
  phone: '',
  email: '',
  receiptTitle: 'TICKET DE VENTA',
  thankYou: '¡Gracias por su compra!',
  currency: 'NIO',
  paymentInfo: '',
};

const createInitialFloorPlan = (): FloorPlan[] => [{
  id: 'floor-1',
  name: 'Piso 1',
  sections: [
    { id: 'main', name: 'Salón principal' },
    { id: 'terrace', name: 'Terraza' },
  ],
  elements: Array.from({ length: 12 }, (_, index) => ({
    id: `table-${index + 1}`,
    kind: 'table' as const,
    tableId: index + 1,
    label: `Mesa ${index + 1}`,
    x: 8 + (index % 4) * 23,
    y: 10 + Math.floor(index / 4) * 28,
    shape: index % 2 === 0 ? 'round' as const : 'square' as const,
    material: 'wood' as const,
    section: 'main',
  })),
}];

const initialProducts: Product[] = [
  { id: 1, name: 'Hamburguesa clásica', category: 'Cocina', price: 180, stock: null },
  { id: 2, name: 'Papas fritas', category: 'Cocina', price: 75, stock: null },
  { id: 3, name: 'Pizza personal', category: 'Cocina', price: 220, stock: null },
  { id: 4, name: 'Gaseosa', category: 'Bebidas', price: 40, stock: 30 },
  { id: 5, name: 'Cerveza', category: 'Bebidas', price: 65, stock: 24 },
  { id: 6, name: 'Agua embotellada', category: 'Bebidas', price: 30, stock: 20 },
  { id: 7, name: 'Papas de bolsa', category: 'Snacks', price: 35, stock: 15 },
  { id: 8, name: 'Cigarros', category: 'Otros', price: 100, stock: 10 },
];

const initialTables: TableData[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, items: [], sent: false,
}));

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

async function findProductImage(productName: string): Promise<ProductImageResult | null> {
  const name = productName.trim();
  const queries = [name];

  if (/toña|tona/i.test(name)) {
    queries.push(
      'Cerveza Tona Nicaragua lata 350 ml',
      'Tona beer can Nicaragua',
      'Nicaraguan beer can',
    );
  } else if (/victoria/i.test(name)) {
    queries.push(
      'Cerveza Victoria Nicaragua lata 350 ml',
      'Victoria Frost Nicaragua beer can',
      'Nicaraguan beer can',
    );
  } else if (/cerveza|beer/i.test(name)) {
    queries.push(`${name} beer can`, 'beer can product photography');
  } else {
    queries[0] = `${name} food dish`;
  }

  let lastError: Error | null = null;
  for (const query of [...new Set(queries)]) {
    try {
      const response = await fetch(
        `/api/product-image?query=${encodeURIComponent(query)}`
      );
      const data = await response.json() as {
        image?: ProductImageResult | null;
        error?: string;
      };

      if (!response.ok) {
        const error = new Error(
          data.error || `Error HTTP ${response.status} al buscar la imagen.`
        );
        lastError = error;
        if (response.status === 429 || response.status === 503) break;
        continue;
      }

      if (data.image?.imageUrl) return data.image;
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error('No se pudo completar la búsqueda de imagen.');
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function createProductImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('La imagen original debe pesar menos de 8 MB.');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.68, 0.54]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const sizeInBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        if (sizeInBytes <= 800 * 1024) return dataUrl;
      }
      scale *= 0.75;
    }

    throw new Error('No se pudo reducir la imagen lo suficiente para guardarla.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function App() {
  const [role, setRole] = useState<'Caja' | 'Mesero'>('Caja');
  const [page, setPage] = useState('Mesas');
  const [inventoryTab, setInventoryTab] = useState<'menu' | 'compras' | 'kardex'>('menu');
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>(() => {
    const saved = readStorage<FloorPlan[]>('mf-floor-plans', createInitialFloorPlan());
    return saved.length > 0 ? saved : createInitialFloorPlan();
  });
  const [activeFloorId, setActiveFloorId] = useState('floor-1');
  const [activeSectionId, setActiveSectionId] = useState('main');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(
    () => readStorage('mf-products', initialProducts)
  );
  const [tables, setTables] = useState<TableData[]>(
    () => readStorage<TableData[]>('mf-tables', initialTables).map(table => ({
      ...table,
      items: table.items.map(item => ({
        ...item,
        sentQuantity: item.sentQuantity ?? (table.sent ? item.quantity : 0),
        servedQuantity: item.servedQuantity ?? 0,
      })),
    }))
  );
  const [movements, setMovements] = useState<InventoryMovement[]>(
    () => readStorage('mf-inventory-movements', [])
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('0');
  const [newStock, setNewStock] = useState('0');
  const [newCategory, setNewCategory] = useState('Bebidas');
  const [newStockControl, setNewStockControl] = useState<
    'controlable' | 'no-controlable'
  >('controlable');
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [pendingImageProductId, setPendingImageProductId] = useState<number | null>(null);
  const [pendingImageProductName, setPendingImageProductName] = useState('');
  const [pendingImageSearchError, setPendingImageSearchError] = useState('');
  const [pendingImageUploadError, setPendingImageUploadError] = useState('');
  const [notice, setNotice] = useState('');
  const [restaurant, setRestaurant] = useState<RestaurantInfo>(() => ({
    ...emptyRestaurantInfo,
    ...readStorage<Partial<RestaurantInfo>>('mf-restaurant-info', {}),
  }));
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Tarjeta'>('Efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [restaurantSaved, setRestaurantSaved] = useState(false);
  const [restaurantSaveError, setRestaurantSaveError] = useState('');
  const [purchaseProductId, setPurchaseProductId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [purchaseReason, setPurchaseReason] = useState('');

  useEffect(() => {
    localStorage.setItem('mf-products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('mf-tables', JSON.stringify(tables));
  }, [tables]);

  useEffect(() => {
    localStorage.setItem('mf-inventory-movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('mf-floor-plans', JSON.stringify(floorPlans));
  }, [floorPlans]);

  const activeFloor = floorPlans.find(floor => floor.id === activeFloorId) ?? floorPlans[0];
  const activeElement = activeFloor?.elements.find(
    element => element.id === selectedElementId
  );
  const updateFloor = (updater: (floor: FloorPlan) => FloorPlan) => {
    setFloorPlans(old =>
      old.map(floor => floor.id === activeFloor?.id ? updater(floor) : floor)
    );
  };

  const activeTable = tables.find(t => t.id === selected);
  const total = (items: Item[]) =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const formatCurrency = (amount: number) =>
    `${restaurant.currency === 'USD' ? 'US$' : 'C$'} ${amount.toFixed(2)}`;
  const updateRestaurant = <K extends keyof RestaurantInfo>(
    key: K,
    value: RestaurantInfo[K],
  ) => {
    setRestaurant(old => ({ ...old, [key]: value }));
    setRestaurantSaved(false);
    setRestaurantSaveError('');
  };
  const pendingItems = (table: TableData) =>
    table.items
      .map(item => ({
        ...item,
        pendingQuantity:
          (item.sentQuantity ?? (table.sent ? item.quantity : 0)) -
          (item.servedQuantity ?? 0),
      }))
      .filter(item => item.pendingQuantity > 0);

  const generateReceiptPDF = async (tableId: number, items: Item[]) => {
    const width = RECEIPT_WIDTH_MM;
    const margin = 6;
    const contentWidth = width - margin * 2;
    const rightEdge = width - margin;
    const columns = {
      item: contentWidth * 0.39,
      quantity: contentWidth * 0.13,
      price: contentWidth * 0.21,
      amount: contentWidth * 0.27,
    };
    const itemX = margin;
    const quantityX = itemX + columns.item;
    const priceX = quantityX + columns.quantity;
    const measureDoc = new jsPDF({ unit: 'mm', format: [width, 120] });

    measureDoc.setFontSize(7.5);
    const rows = items.map(item => ({
      item,
      descriptionLines: measureDoc.splitTextToSize(
        item.name,
        columns.item - 1,
      ),
    }));
    const rowHeights = rows.map(row =>
      Math.max(4.5, row.descriptionLines.length * 3.5) + 2.5
    );

    const restaurantName = 'RESTAURANTE';
    const receiptTitle = 'TICKET DE VENTA';
    const thankYou = '¡Gracias por su compra!';
    const dateLine = `Fecha: ${localDateTimeNow()}`;
    const tableLine = `Mesa: ${tableId}`;

    measureDoc.setFontSize(10);
    const restaurantNameLines = measureDoc.splitTextToSize(
      restaurantName,
      contentWidth,
    ).slice(0, 2);

    measureDoc.setFontSize(9);
    const receiptTitleLines = measureDoc.splitTextToSize(
      receiptTitle,
      contentWidth,
    ).slice(0, 2);

    measureDoc.setFontSize(7);
    const metadataLines = [dateLine, tableLine].flatMap(line =>
      measureDoc.splitTextToSize(line, contentWidth)
    );

    const headerY =
      9 +
      restaurantNameLines.length * 4 + 2 +
      receiptTitleLines.length * 3.8 + 2 +
      metadataLines.length * 3.5 + 5;

    const detailTitleY = headerY;
    const columnTitleY = detailTitleY + 7;
    const dividerY = columnTitleY + 2.5;
    const firstRowY = dividerY + 4;
    const rowsEndY = firstRowY +
      rowHeights.reduce((sum, height) => sum + height, 0);

    const thankYouLines = measureDoc.splitTextToSize(
      thankYou,
      contentWidth,
    );
    const pageHeight = Math.max(
      94,
      rowsEndY + 36 + Math.max(0, thankYouLines.length - 1) * 3.2,
    );

    const doc = new jsPDF({ unit: 'mm', format: [width, pageHeight] });

    doc.setDrawColor(30);
    doc.setLineWidth(0.25);
    doc.rect(2.2, 2.2, width - 4.4, pageHeight - 4.4);
    doc.setLineWidth(0.15);
    doc.rect(3.8, 3.8, width - 7.6, pageHeight - 7.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(restaurantNameLines, width / 2, 9, { align: 'center' });

    let yHeader = 9 + restaurantNameLines.length * 4 + 2;

    doc.setFontSize(9);
    doc.text(receiptTitleLines, width / 2, yHeader, { align: 'center' });
    yHeader += receiptTitleLines.length * 3.8 + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    [dateLine, tableLine].forEach(line => {
      const wrapped = doc.splitTextToSize(line, contentWidth);
      doc.text(wrapped, margin, yHeader);
      yHeader += wrapped.length * 3.5;
    });

    doc.setLineWidth(0.45);
    doc.line(margin, dividerY - 2, rightEdge, dividerY - 2);
    doc.setLineWidth(0.2);
    doc.line(margin, dividerY - 0.5, rightEdge, dividerY - 0.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DETALLE DE ARTÍCULOS', margin, detailTitleY);

    doc.setFontSize(6.8);
    doc.text('ARTÍCULO', itemX, columnTitleY);
    doc.text('CANT.', quantityX + columns.quantity / 2, columnTitleY, {
      align: 'center',
    });
    doc.text('PRECIO', priceX + columns.price - 1, columnTitleY, {
      align: 'right',
    });
    doc.text('IMPORTE', rightEdge, columnTitleY, { align: 'right' });

    doc.setLineWidth(0.25);
    doc.line(margin, dividerY, rightEdge, dividerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    let y = firstRowY;

    rows.forEach(({ item, descriptionLines }, index) => {
      doc.text(descriptionLines, itemX, y);
      doc.text(String(item.quantity), quantityX + columns.quantity / 2, y, {
        align: 'center',
      });
      doc.text(formatCurrency(item.price), priceX + columns.price - 1, y, {
        align: 'right',
      });
      doc.text(
        formatCurrency(item.price * item.quantity),
        rightEdge,
        y,
        { align: 'right' },
      );

      y += rowHeights[index];
      doc.setDrawColor(190);
      doc.setLineWidth(0.12);
      doc.line(margin, y - 1, rightEdge, y - 1);
    });

    y += 5;
    doc.setDrawColor(30);
    doc.setLineWidth(0.45);
    doc.line(margin, y, rightEdge, y);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 1.5, rightEdge, y + 1.5);

    const amount = total(items);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TOTAL A COBRAR', margin, y);
    doc.setFontSize(13);
    doc.text(formatCurrency(amount), rightEdge, y, { align: 'right' });

    y += 8;
    doc.setLineWidth(0.25);
    doc.line(margin, y, rightEdge, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(thankYouLines, width / 2, y + 7, { align: 'center' });

    const ticketId = timestampNow().replace(/[:.]/g, '-');
    await doc.save(`ticket-mesa-${tableId}-${ticketId}.pdf`, {
      returnPromise: true,
    });
  };

  const generateCommandPDF = (tableId: number, items: Item[]) => {
    const width = RECEIPT_WIDTH_MM;
    const margin = 6;
    const contentWidth = width - margin * 2;
    const measureDoc = new jsPDF({ unit: 'mm', format: [width, 120] });

    measureDoc.setFont('helvetica', 'normal');
    measureDoc.setFontSize(8);

    const rows = items.map(item => ({
      item,
      descriptionLines: measureDoc.splitTextToSize(item.name, contentWidth - 13),
    }));
    const firstRowY = 55;
    const rowHeights = rows.map(row =>
      Math.max(5, row.descriptionLines.length * 4) + 3
    );
    const rowsEndY = firstRowY + rowHeights.reduce((sum, height) => sum + height, 0);
    const pageHeight = Math.max(90, rowsEndY + 17);
    const doc = new jsPDF({ unit: 'mm', format: [width, pageHeight] });
    const rightEdge = width - margin;

    doc.setDrawColor(30);
    doc.setLineWidth(0.25);
    doc.rect(2.2, 2.2, width - 4.4, pageHeight - 4.4);
    doc.setLineWidth(0.15);
    doc.rect(3.8, 3.8, width - 7.6, pageHeight - 7.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMANDA DE COCINA', width / 2, 14, { align: 'center' });
    doc.setFontSize(15);
    doc.text(`MESA ${tableId}`, width / 2, 23, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Fecha: ${localDateTimeNow()}`, margin, 31);

    doc.setLineWidth(0.45);
    doc.line(margin, 36, rightEdge, 36);
    doc.setLineWidth(0.2);
    doc.line(margin, 37.5, rightEdge, 37.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ORDEN DE PREPARACIÓN', margin, 45);
    doc.setFontSize(8);
    doc.text('PRODUCTO', margin, 51);
    doc.text('CANT.', rightEdge, 51, { align: 'right' });
    doc.setLineWidth(0.25);
    doc.line(margin, 53, rightEdge, 53);

    let y = firstRowY;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    rows.forEach(({ item, descriptionLines }, index) => {
      doc.text(descriptionLines, margin, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(item.quantity), rightEdge, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += rowHeights[index];
      doc.setDrawColor(190);
      doc.setLineWidth(0.12);
      doc.line(margin, y - 1, rightEdge, y - 1);
    });

    y += 5;
    doc.setLineWidth(0.3);
    doc.line(margin, y, rightEdge, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FIN DE COMANDA', width / 2, y + 7, { align: 'center' });
    const ticketId = timestampNow().replace(/[:.]/g, '-');
    doc.save(`comanda-mesa-${tableId}-${ticketId}.pdf`);
  };

  const updateTable = (id: number, fn: (t: TableData) => TableData) => {
    setTables(old => old.map(t => t.id === id ? fn(t) : t));
  };

  const addToOrder = (product: Product) => {
    if (selected === null || !activeTable) return;

    if (product.stock !== null) {
      const committed = tables.reduce((quantity, table) =>
        quantity + table.items.reduce((sum, item) =>
          sum + (item.productId === product.id ? item.quantity : 0), 0
        ), 0
      );
      if (committed >= product.stock) {
        setNotice(`No hay stock disponible de ${product.name}.`);
        return;
      }
    }

    updateTable(selected, t => ({
      ...t,
      items: t.items.some(i => i.productId === product.id)
        ? t.items.map(i => {
            if (i.productId !== product.id) {
              return {
                ...i,
                sentQuantity: i.sentQuantity ?? (t.sent ? i.quantity : 0),
              };
            }

            return {
              ...i,
              quantity: i.quantity + 1,
              sentQuantity: i.sentQuantity ?? (t.sent ? i.quantity : 0),
            };
          })
        : [
            ...t.items,
            {
              productId: product.id,
              name: product.name,
              price: product.price,
              quantity: 1,
              sentQuantity: 0,
            },
          ],
    }));

    setNotice(
      activeTable.sent
        ? `Se agregó ${product.name} a la nueva ronda de la mesa ${selected}.`
        : `${product.name} agregado al pedido.`,
    );
  };

  const changeQuantity = (productId: number, amount: number) => {
    if (!activeTable || selected === null) return;

    updateTable(selected, t => ({
      ...t,
      items: t.items
        .map(i => {
          const sentQuantity =
            i.sentQuantity ?? (t.sent ? i.quantity : 0);

          if (i.productId !== productId) {
            return { ...i, sentQuantity };
          }

          // El mesero no puede reducir unidades de rondas anteriores.
          if (
            role === 'Mesero' &&
            t.sent &&
            amount < 0 &&
            i.quantity <= sentQuantity
          ) {
            return { ...i, sentQuantity };
          }

          return {
            ...i,
            quantity: i.quantity + amount,
            sentQuantity,
          };
        })
        .filter(i => i.quantity > 0),
    }));
  };

  const removeOrderProduct = (productId: number) => {
    if (selected === null || !activeTable) return;

    const item = activeTable.items.find(
      orderItem => orderItem.productId === productId
    );
    if (!item) return;

    const sentQuantity =
      item.sentQuantity ?? (activeTable.sent ? item.quantity : 0);
    if (sentQuantity > 0) {
      setNotice('Este producto ya tiene unidades enviadas. No se puede eliminar por completo desde aquí.');
      return;
    }

    if (!window.confirm(`¿Quitar "${item.name}" del pedido?`)) return;

    updateTable(selected, table => ({
      ...table,
      items: table.items.filter(orderItem => orderItem.productId !== productId),
    }));
    setNotice(`"${item.name}" se quitó del pedido.`);
  };

  const sendOrder = () => {
    if (!activeTable || selected === null || activeTable.items.length === 0) {
      setNotice('Agrega al menos un producto antes de enviar.');
      return;
    }

    const commandItems = activeTable.items
      .map(item => {
        const alreadySent =
          item.sentQuantity ?? (activeTable.sent ? item.quantity : 0);
        return { ...item, quantity: item.quantity - alreadySent };
      })
      .filter(item => item.quantity > 0);

    if (commandItems.length === 0) {
      setNotice('Agrega productos nuevos antes de enviar otra ronda.');
      return;
    }

    const tableId = selected;
    const isNewRound = activeTable.sent;

    generateCommandPDF(tableId, commandItems);

    updateTable(tableId, t => ({
      ...t,
      sent: true,
      items: t.items.map(i => ({
        ...i,
        sentQuantity: i.quantity,
      })),
    }));

    setNotice(
      isNewRound
        ? `Nueva ronda de la mesa ${tableId} enviada. Ticket de comanda generado.`
        : `Comanda de mesa ${tableId} enviada. Ticket de comanda generado.`,
    );

    setSelected(null);
    setPage('Mesas');
  };

  const closeAccount = async () => {
    if (role !== 'Caja' || selected === null || !activeTable) return;
    if (!activeTable.paymentPending) return;

    const amount = total(activeTable.items);
    const received = Number(cashReceived);

    if (paymentMethod === 'Efectivo' &&
        (cashReceived.trim() === '' || !Number.isFinite(received) || received < amount)) {
      setNotice('Falta efectivo para cobrar el servicio.');
      return;
    }

    if (paymentMethod === 'Tarjeta' &&
        !window.confirm('¿Confirmas que el terminal aprobó el pago con tarjeta?')) {
      return;
    }

    if (!window.confirm(`¿Confirmas cerrar la cuenta de ${formatCurrency(amount)}?`)) {
      return;
    }

    const soldProducts = activeTable.items.reduce((sold, item) => {
      sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
      return sold;
    }, new Map<number, number>());
    const unavailableProduct = products.find(product =>
      product.stock !== null &&
      (soldProducts.get(product.id) ?? 0) > product.stock
    );

    if (unavailableProduct) {
      setNotice(`Stock insuficiente de ${unavailableProduct.name}. Actualiza el inventario antes de cobrar.`);
      return;
    }

    const now = timestampNow();
    const saleMovements = products.flatMap(product => {
      const sold = soldProducts.get(product.id) ?? 0;
      if (product.stock === null || sold === 0) return [];

      return [{
        id: `${Date.now()}-${product.id}`,
        productId: product.id,
        productName: product.name,
        type: 'Venta' as const,
        quantity: -sold,
        stockBefore: product.stock,
        stockAfter: product.stock - sold,
        unitCost: null,
        reason: `Venta cobrada · Mesa ${activeTable.id}`,
        createdAt: now,
      }];
    });

    setProducts(old => old.map(p => {
      if (p.stock === null) return p;

      const sold = soldProducts.get(p.id) ?? 0;

      return { ...p, stock: p.stock - sold };
    }));
    setMovements(old => [...saleMovements, ...old]);

    updateTable(selected, t => ({
      ...t,
      items: [],
      sent: false,
      paymentPending: false,
    }));

    setCashReceived('');
    setPaymentMethod('Efectivo');
    setSelected(null);
    setPage('Mesas');
    setNotice('Pago registrado. Cuenta cerrada e inventario actualizado.');
  };

  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setNewName(product.name);
    setNewPrice(String(product.price));
    setNewStock(product.stock === null ? '0' : String(product.stock));
    setNewStockControl(product.stock === null ? 'no-controlable' : 'controlable');
    setNewCategory(product.category);
    setNotice(`Editando producto: ${product.name}`);
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setNewName('');
    setNewPrice('0');
    setNewStock('0');
    setNewStockControl('controlable');
    setNewCategory('Bebidas');
    setNotice('Edición cancelada.');
  };

  const addProduct = async () => {
    const name = newName.trim();
    const price = Number(newPrice);
    const controlsStock = newStockControl === 'controlable';
    const stock = controlsStock ? Number(newStock) : null;
    const category = newCategory;
    if (
      !name ||
      !Number.isFinite(price) ||
      price < 0 ||
      (controlsStock && (stock === null || !Number.isInteger(stock) || stock < 0))
    ) {
      setNotice('Revisa el nombre, el precio y el stock inicial.');
      return;
    }

    if (editingProductId !== null) {
      const product = products.find(item => item.id === editingProductId);
      if (!product) {
        setNotice('No se encontró el producto que intentas editar.');
        cancelEditProduct();
        return;
      }

      const hasOpenOrders = tables.some(table =>
        table.items.some(item => item.productId === product.id)
      );
      if (hasOpenOrders && (product.stock === null) !== (stock === null)) {
        setNotice('No puedes cambiar el control de stock mientras el producto esté en una cuenta abierta.');
        return;
      }

      setIsAddingProduct(true);
      setNotice(`Buscando imagen para ${name}...`);
      let image: ProductImageResult | null = null;
      let imageError = '';
      try {
        image = await findProductImage(name);
      } catch (error) {
        imageError = error instanceof Error
          ? error.message
          : 'No se pudo completar la búsqueda de imagen.';
      }

      const stockBefore = product.stock ?? 0;
      const stockAfter = stock ?? 0;
      const inventoryChanged = stockBefore !== stockAfter;
      const updatedProduct: Product = {
        ...product,
        name,
        price,
        category,
        stock,
        ...(image ?? {}),
      };

      setProducts(old => old.map(item =>
        item.id === product.id ? updatedProduct : item
      ));

      if (inventoryChanged && (product.stock !== null || stock !== null)) {
        const movementTimestamp = timestampNow();
        setMovements(old => [{
          id: `${movementTimestamp}-${product.id}`,
          productId: product.id,
          productName: name,
          type: 'Ajuste',
          quantity: stockAfter - stockBefore,
          stockBefore,
          stockAfter,
          unitCost: null,
          reason: product.stock === null
            ? 'Activación del control de inventario'
            : stock === null
              ? 'Desactivación del control de inventario'
              : 'Ajuste de existencias al editar producto',
          createdAt: movementTimestamp,
        }, ...old]);
      }

      setEditingProductId(null);
      setNewName('');
      setNewPrice('0');
      setNewStock('0');
      setNewStockControl('controlable');
      setNewCategory('Bebidas');
      setIsAddingProduct(false);
      setNotice(
        image
          ? `Producto "${name}" actualizado con una nueva imagen.`
          : imageError
            ? `Producto "${name}" actualizado; se conserva la imagen anterior. ${imageError}`
            : `Producto "${name}" actualizado; se conserva la imagen anterior porque no se encontró otra.`,
      );
      return;
    }

    setIsAddingProduct(true);
    setNotice(`Buscando imagen para ${name}...`);
    let image: ProductImageResult | null = null;
    let imageError = '';
    try {
      image = await findProductImage(name);
    } catch (error) {
      imageError = error instanceof Error
        ? error.message
        : 'No se pudo completar la búsqueda de imagen.';
    }

    const id = Date.now();
    setProducts(old => [...old, {
      id, name, price, category,
      stock,
      ...(image ?? {}),
    }]);
    if (controlsStock && stock !== null && stock > 0) {
      setMovements(old => [{
        id: `${id}-initial`,
        productId: id,
        productName: name,
        type: 'Ajuste',
        quantity: stock,
        stockBefore: 0,
        stockAfter: stock,
        unitCost: null,
        reason: 'Stock inicial del producto',
        createdAt: timestampNow(),
      }, ...old]);
    }
    setNewName('');
    setNewPrice('0');
    setNewStock('0');
    setNewStockControl('controlable');
    setIsAddingProduct(false);
    if (image) {
      setNotice(`Producto "${name}" agregado con su imagen.`);
    } else {
      setPendingImageProductId(id);
      setPendingImageProductName(name);
      setPendingImageSearchError(imageError);
      setPendingImageUploadError('');
      setNotice('');
    }
  };

  const handlePendingProductImage = async (file: File | undefined) => {
    if (!file || pendingImageProductId === null) return;

    setPendingImageUploadError('');
    try {
      const imageUrl = await createProductImageDataUrl(file);
      const updatedProducts = products.map(product =>
        product.id === pendingImageProductId
          ? {
              ...product,
              imageUrl,
              imageCredit: 'Imagen subida por el usuario',
              imageCreditUrl: '',
              imageSourceUrl: '',
            }
          : product
      );
      if (!updatedProducts.some(product => product.id === pendingImageProductId)) {
        throw new Error('No se encontró el producto al que se asignará la imagen.');
      }

      try {
        localStorage.setItem('mf-products', JSON.stringify(updatedProducts));
      } catch {
        throw new Error('No hay espacio suficiente en el navegador para guardar esta imagen.');
      }

      setProducts(updatedProducts);
      setPendingImageProductId(null);
      setPendingImageProductName('');
      setPendingImageSearchError('');
      setNotice(`Imagen guardada para "${pendingImageProductName}".`);
    } catch (error) {
      setPendingImageUploadError(error instanceof Error
        ? error.message
        : 'No se pudo cargar la imagen. Intenta otra vez.');
    }
  };

  const continueWithoutProductImage = () => {
    setPendingImageProductId(null);
    setPendingImageProductName('');
    setPendingImageSearchError('');
    setPendingImageUploadError('');
    setNotice('El producto se guardó sin imagen. Puedes agregarla después.');
  };

  const registerPurchase = () => {
    const product = products.find(
      item => item.id === Number(purchaseProductId)
    );
    const quantity = Number(purchaseQuantity);
    const unitCost = Number(purchaseUnitCost);
    const reason = purchaseReason.trim();

    if (!product || product.stock === null) {
      setNotice('Selecciona un producto que controle existencias.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 ||
        !Number.isFinite(unitCost) || unitCost < 0) {
      setNotice('Indica una cantidad entera positiva y un costo unitario válido.');
      return;
    }

    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;
    setProducts(old => old.map(item =>
      item.id === product.id ? { ...item, stock: stockAfter } : item
    ));
    setMovements(old => [{
      id: `${Date.now()}-${product.id}`,
      productId: product.id,
      productName: product.name,
      type: 'Compra',
      quantity,
      stockBefore,
      stockAfter,
      unitCost,
      reason: reason || 'Compra de inventario',
      createdAt: timestampNow(),
    }, ...old]);
    setPurchaseQuantity('');
    setPurchaseUnitCost('');
    setPurchaseReason('');
    setNotice(`Compra registrada. Stock de ${product.name}: ${stockAfter}.`);
  };

  const adjustStock = (productId: number, quantity: number, reason: string) => {
    const product = products.find(item => item.id === productId);
    if (!product || product.stock === null) return;

    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;
    if (stockAfter < 0) {
      setNotice(`No hay stock suficiente de ${product.name} para aplicar la salida.`);
      return;
    }

    setProducts(old => old.map(item =>
      item.id === productId ? { ...item, stock: stockAfter } : item
    ));
    setMovements(old => [{
      id: `${Date.now()}-${productId}`,
      productId,
      productName: product.name,
      type: 'Ajuste',
      quantity,
      stockBefore,
      stockAfter,
      unitCost: null,
      reason,
      createdAt: timestampNow(),
    }, ...old]);
  };

  const addFloorTable = () => {
    if (!activeFloor) {
      setNotice('No se encontró un piso activo para agregar la mesa.');
      return;
    }

    const nextId = Math.max(0, ...tables.map(table => table.id)) + 1;
    const elementId = `table-${nextId}-${Date.now()}`;

    setTables(old => [...old, { id: nextId, items: [], sent: false }]);
    updateFloor(floor => ({
      ...floor,
      elements: [
        ...floor.elements,
        {
          id: elementId,
          kind: 'table',
          tableId: nextId,
          label: `Mesa ${nextId}`,
          x: 10 + (floor.elements.length % 4) * 21,
          y: 10 + (Math.floor(floor.elements.length / 4) % 3) * 27,
          shape: 'round',
          material: 'wood',
          section: activeSectionId,
        },
      ],
    }));
    setNotice(`Mesa ${nextId} agregada al plano y al sistema de mesas.`);
  };

  const addBar = () => {
    if (!activeFloor) {
      setNotice('No se encontró un piso activo para agregar la barra.');
      return;
    }

    updateFloor(floor => ({
      ...floor,
      elements: [
        ...floor.elements,
        {
          id: `bar-${Date.now()}`,
          kind: 'bar',
          label: 'Barra',
          x: 65,
          y: 10,
          shape: 'rectangle',
          material: 'wood',
          section: activeSectionId,
        },
      ],
    }));
    setNotice('Barra decorativa agregada al plano.');
  };

  const addSection = () => {
    if (!activeFloor) return;

    const name = window.prompt('Nombre de la nueva zona o sección:');
    if (!name?.trim()) return;

    const id = `section-${Date.now()}`;
    updateFloor(floor => ({
      ...floor,
      sections: [...floor.sections, { id, name: name.trim() }],
    }));
    setActiveSectionId(id);
    setSelectedElementId(null);
  };

  const addFloor = () => {
    const name = window.prompt('Nombre del nuevo piso:', `Piso ${floorPlans.length + 1}`);
    if (!name?.trim()) return;

    const id = `floor-${Date.now()}`;
    setFloorPlans(old => [
      ...old,
      {
        id,
        name: name.trim(),
        sections: [{ id: 'main', name: 'Salón principal' }],
        elements: [],
      },
    ]);
    setActiveFloorId(id);
    setActiveSectionId('main');
    setSelectedElementId(null);
  };

  const moveFloorElement = (elementId: string, x: number, y: number) => {
    updateFloor(floor => ({
      ...floor,
      elements: floor.elements.map(element =>
        element.id === elementId
          ? {
              ...element,
              x: Math.max(5, Math.min(95, x)),
              y: Math.max(8, Math.min(92, y)),
            }
          : element
      ),
    }));
  };

  const updateSelectedElement = (changes: Partial<FloorElement>) => {
    if (!selectedElementId) return;

    updateFloor(floor => ({
      ...floor,
      elements: floor.elements.map(element =>
        element.id === selectedElementId ? { ...element, ...changes } : element
      ),
    }));
  };

  const removeSelectedElement = () => {
    if (!activeElement) return;

    if (activeElement.kind === 'table' && activeElement.tableId !== undefined) {
      const table = tables.find(item => item.id === activeElement.tableId);
      if (table?.items.length) {
        setNotice('No puedes quitar una mesa que tenga una cuenta abierta.');
        return;
      }

      if (!window.confirm(`¿Quitar la Mesa ${activeElement.tableId} del plano y del sistema?`)) {
        return;
      }
      setTables(old => old.filter(item => item.id !== activeElement.tableId));
    }

    updateFloor(floor => ({
      ...floor,
      elements: floor.elements.filter(element => element.id !== selectedElementId),
    }));
    setSelectedElementId(null);
    setNotice('Elemento eliminado.');
  };

  const visibleProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (category === 'Todos' || p.category === category)
  );

  const nav = [
    { name: 'Mesas', icon: LayoutDashboard },
    { name: 'Edición', icon: Settings },
    { name: 'Comandas', icon: Utensils },
    { name: 'Inventario', icon: Package },
    { name: 'Arqueo', icon: ClipboardCheck },
    { name: 'Configuración', icon: Settings },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Utensils size={25} /></div>
          <div><strong>MesaFácil</strong><small>GESTIÓN RESTAURANTE</small></div>
        </div>
        <div className="side-label">MENÚ PRINCIPAL</div>
        {nav.map(n => {
          const Icon = n.icon;
          return <button key={n.name}
            className={`nav-item ${page === n.name ? 'active' : ''}`}
            onClick={() => {
              setPage(n.name);
              setSelected(null);
              if (n.name === 'Inventario') setInventoryTab('menu');
            }}>
            <Icon size={19} /> {n.name}
          </button>;
        })}
        <div className="sidebar-bottom">
          <div className="connection"><Wifi size={16} /> Datos guardados en este dispositivo</div>
          <small>Versión inicial · Modo local</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{selected !== null ? `Mesa ${selected}` : page}</h1>
            <p>Tu restaurante, organizado en un solo lugar.</p>
          </div>
          <div className="top-actions">
            <span className="role-label">Rol activo</span>
            <select value={role} onChange={e => setRole(e.target.value as 'Caja' | 'Mesero')}>
              <option value="Caja">Admin / Caja</option>
              <option value="Mesero">Mesero</option>
            </select>
            <span className="avatar">{role === 'Caja' ? 'C' : 'M'}</span>
          </div>
        </header>

        {notice && <div className="notice" role="status">
          <CheckCircle2 size={18} /> <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Cerrar"><X size={17} /></button>
        </div>}

        {pendingImageProductId !== null && (
          <div className="product-image-modal-backdrop">
            <section
              className="product-image-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-image-title"
            >
              <div className="product-image-modal-icon" aria-hidden="true">📷</div>
              <h2 id="product-image-title">Falta la imagen del artículo</h2>
              <p>
                No encontramos una imagen automática para{' '}
                <strong>{pendingImageProductName}</strong>. Sube una foto para completar el artículo.
              </p>
              {pendingImageSearchError && (
                <p className="product-image-search-error">
                  La búsqueda automática no estuvo disponible; el producto ya quedó guardado.
                </p>
              )}

              <label htmlFor="upload-product-image" className="primary-button product-image-upload">
                📤 Seleccionar imagen
              </label>
              <input
                id="upload-product-image"
                className="product-image-file-input"
                type="file"
                accept="image/*"
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void handlePendingProductImage(file);
                }}
              />
              <p className="product-image-hint">
                Se aceptan imágenes de hasta 8 MB; se comprimen para guardarlas en este navegador.
              </p>
              {pendingImageUploadError && (
                <p className="product-image-upload-error" role="alert">
                  {pendingImageUploadError}
                </p>
              )}

              <button
                type="button"
                className="back-button product-image-continue"
                onClick={continueWithoutProductImage}
              >
                Continuar sin imagen
              </button>
            </section>
          </div>
        )}

        {page === 'Mesas' && selected === null && <>
          <div className="stats">
            <div className="stat-card"><span>Mesas totales</span><strong>{tables.length}</strong><small>Distribución actual</small></div>
            <div className="stat-card"><span>Mesas ocupadas</span><strong>{tables.filter(t => t.items.length > 0).length}</strong><small>Con consumo abierto</small></div>
            <div className="stat-card"><span>Mesas disponibles</span><strong>{tables.filter(t => t.items.length === 0).length}</strong><small>Listas para recibir clientes</small></div>
            <div className="stat-card"><span>Ventas abiertas</span><strong>{formatCurrency(tables.reduce((s, t) => s + total(t.items), 0))}</strong><small>Consumo sin cerrar</small></div>
          </div>
          <div className="section-heading">
            <div><h2>Mapa de mesas</h2><p>Selecciona una mesa para tomar un pedido o cobrar.</p></div>
            <div className="legend"><span className="dot free" /> Libre <span className="dot busy" /> Ocupada</div>
          </div>
          <div className="floor-plan-canvas floor-plan-view">
            {activeFloor?.elements.map(element => {
              const table = element.tableId === undefined
                ? undefined
                : tables.find(item => item.id === element.tableId);
              const occupied = Boolean(table && table.items.length > 0);

              return (
                <button
                  key={element.id}
                  type="button"
                  className={[
                    'floor-element',
                    element.kind === 'bar' ? 'floor-bar' : 'floor-table',
                    `shape-${element.shape}`,
                    `material-${element.material}`,
                    occupied ? 'occupied' : '',
                  ].join(' ')}
                  style={{ left: `${element.x}%`, top: `${element.y}%` }}
                  title={element.kind === 'bar'
                    ? element.label
                    : `${element.label} · ${occupied ? 'Ocupada' : 'Libre'}`}
                  onClick={() => {
                    if (element.kind === 'bar' || element.tableId === undefined) return;
                    setSelected(element.tableId);
                  }}
                  disabled={element.kind === 'bar' || element.tableId === undefined}
                >
                  {element.kind === 'bar' ? (
                    <span>{element.label}</span>
                  ) : (
                    <>
                      <strong>{element.label}</strong>
                      <small>{occupied ? 'Ocupada' : 'Libre'}</small>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </>}

        {page === 'Mesas' && selected !== null && activeTable?.paymentPending && (
          <section className="panel payment-panel">
            <header className="payment-header">
              <div>
                <span className="payment-eyebrow"><Receipt size={15} /> CUENTA PENDIENTE</span>
                <h2>Cobro de mesa {selected}</h2>
                <p>Revisa el consumo y registra el pago del cliente.</p>
              </div>
              <span className="payment-status"><Clock3 size={15} /> Pendiente</span>
            </header>

            <div className="payment-layout">
              <section className="payment-summary" aria-label="Resumen de la cuenta">
                <div className="payment-section-heading">
                  <div>
                    <h3>Detalle de consumo</h3>
                    <p>{activeTable.items.length} {activeTable.items.length === 1 ? 'producto' : 'productos'}</p>
                  </div>
                </div>

                <div className="payment-items">
                  {activeTable.items.map(item => (
                    <div className="payment-item" key={item.productId}>
                      <div className="payment-item-description">
                        <strong>{item.name}</strong>
                        <span>{item.quantity} × {formatCurrency(item.price)}</span>
                      </div>
                      <b>{formatCurrency(item.quantity * item.price)}</b>
                    </div>
                  ))}
                </div>

                <div className="payment-total">
                  <span>Total a cobrar</span>
                  <strong>{formatCurrency(total(activeTable.items))}</strong>
                </div>
              </section>

              <section className="payment-controls" aria-label="Opciones de pago">
                <h3>Método de pago</h3>
                <div className="payment-methods" role="group" aria-label="Seleccionar método de pago">
                  <button
                    type="button"
                    className={`payment-method ${paymentMethod === 'Efectivo' ? 'selected' : ''}`}
                    aria-pressed={paymentMethod === 'Efectivo'}
                    onClick={() => setPaymentMethod('Efectivo')}
                  >
                    <Banknote size={21} />
                    <span><strong>Efectivo</strong><small>Pago en caja</small></span>
                    {paymentMethod === 'Efectivo' && <CheckCircle2 size={17} />}
                  </button>
                  <button
                    type="button"
                    className={`payment-method ${paymentMethod === 'Tarjeta' ? 'selected' : ''}`}
                    aria-pressed={paymentMethod === 'Tarjeta'}
                    onClick={() => setPaymentMethod('Tarjeta')}
                  >
                    <CreditCard size={21} />
                    <span><strong>Tarjeta</strong><small>Terminal de pago</small></span>
                    {paymentMethod === 'Tarjeta' && <CheckCircle2 size={17} />}
                  </button>
                </div>

                {paymentMethod === 'Efectivo' ? (
                  <div className="cash-entry">
                    <label htmlFor="cash-received">Dinero recibido</label>
                    <div className="cash-input-wrap">
                      <span>{restaurant.currency === 'USD' ? 'US$' : 'C$'}</span>
                      <input
                        id="cash-received"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashReceived}
                        onChange={e => setCashReceived(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    {cashReceived.trim() !== '' &&
                      (!Number.isFinite(Number(cashReceived)) || Number(cashReceived) < total(activeTable.items)) && (
                        <p className="payment-error" role="alert">
                          Falta efectivo para cobrar el servicio.
                        </p>
                      )}

                    {cashReceived.trim() !== '' &&
                      Number.isFinite(Number(cashReceived)) &&
                      Number(cashReceived) >= total(activeTable.items) && (
                        <div className="change-display">
                          <span>Cambio para el cliente</span>
                          <strong>{formatCurrency(Number(cashReceived) - total(activeTable.items))}</strong>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="card-payment-note">
                    <CreditCard size={19} />
                    <p>Verifica que el terminal haya aprobado el pago antes de confirmar.</p>
                  </div>
                )}

                <div className="payment-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={async () => {
                      if (!activeTable || selected === null || activeTable.items.length === 0) {
                        setNotice('No hay productos para generar el ticket.');
                        return;
                      }

                      try {
                        await generateReceiptPDF(selected, activeTable.items);
                        setNotice('Ticket generado. Puedes revisar el total antes de cobrar.');
                      } catch (error) {
                        console.error('Error al generar el ticket PDF:', error);
                        setNotice('No se pudo generar el ticket. Revisa la consola del navegador.');
                      }
                    }}
                  >
                    <Receipt size={18} /> Generar ticket antes de cobrar
                  </button>
                  <button
                    type="button"
                    className="pay-button payment-confirm"
                    onClick={closeAccount}
                    disabled={paymentMethod === 'Efectivo' && (
                      cashReceived.trim() === '' ||
                      !Number.isFinite(Number(cashReceived)) ||
                      Number(cashReceived) < total(activeTable.items)
                    )}
                  >
                    <CheckCircle2 size={18} /> Confirmar pago y liberar mesa
                  </button>
                  <button type="button" className="back-button payment-back" onClick={() => setSelected(null)}>
                    <ArrowLeft size={16} /> Volver a las mesas
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}

        {page === 'Mesas' && selected !== null && activeTable && !activeTable.paymentPending && <div className="order-layout">
          <section className="panel menu-panel">
            <div className="section-heading"><div><h2>Agregar productos</h2><p>Selecciona los artículos del pedido.</p></div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Volver"><X /></button></div>
            <div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."/></div>
            <div className="category-row">
              {['Todos', 'Cocina', 'Bebidas', 'Snacks', 'Otros'].map(c =>
                <button key={c} className={`category-chip ${category === c ? 'chosen' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
            </div>
            <div className="product-grid">
              {visibleProducts.map(p => (
                <div className="product-entry" key={p.id}>
                  <button className="product-card" onClick={() => addToOrder(p)}>
                    {p.imageUrl ? (
                      <img className="product-photo" src={p.imageUrl} alt={p.name} loading="lazy" />
                    ) : (
                      <span className="product-emoji">
                        {p.category === 'Cocina' ? '🍔'
                          : p.category === 'Bebidas' ? '🥤'
                          : p.category === 'Snacks' ? '🍟'
                          : '🛍️'}
                      </span>
                    )}
                    <strong>{p.name}</strong><small>{p.category}</small>
                    <b>{formatCurrency(p.price)}</b><span className="add-icon"><Plus size={16}/></span>
                  </button>
                  {p.imageUrl && p.imageCreditUrl && (
                    <small className="photo-credit">
                      Foto: <a href={p.imageCreditUrl} target="_blank" rel="noreferrer">
                        {p.imageCredit || 'Fotógrafo'}
                      </a>
                      {' · '}
                      <a href={p.imageSourceUrl || 'https://unsplash.com/'} target="_blank" rel="noreferrer">
                        Unsplash
                      </a>
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="panel order-panel">
            <div className="order-title"><div><h2>Pedido · Mesa {selected}</h2><p>{activeTable.sent
              ? 'Pedido enviado · Puedes agregar una nueva ronda'
              : 'Pedido en preparación'}</p></div>
              <Receipt size={24}/></div>
            {activeTable.items.length === 0
              ? <div className="empty-state"><Utensils size={34}/><strong>Tu pedido está vacío</strong><p>Agrega productos del menú.</p></div>
              : <div className="order-items">{activeTable.items.map(i => {
                const product = products.find(item => item.id === i.productId);
                return <div className="order-line" key={i.productId}>
                  <div className="order-product">
                    {product?.imageUrl ? (
                      <img className="order-product-photo" src={product.imageUrl} alt={i.name} loading="lazy" />
                    ) : (
                      <span className="order-product-emoji">
                        {product?.category === 'Bebidas' ? '🥤' : '🍽️'}
                      </span>
                    )}
                    <div>
                      <strong>{i.name}</strong>
                      <small>{formatCurrency(i.price)} c/u</small>
                    </div>
                  </div>
                  <div className="quantity">
                    <button
                      disabled={
                        role === 'Mesero' &&
                        activeTable.sent &&
                        i.quantity <= (i.sentQuantity ?? i.quantity)
                      }
                      onClick={() => changeQuantity(i.productId, -1)}
                    ><Minus size={14}/></button>
                    <span>{i.quantity}</span>
                    <button onClick={() => changeQuantity(i.productId, 1)}><Plus size={14}/></button>
                  </div>
                  <b>{formatCurrency(i.price * i.quantity)}</b>
                  {(i.sentQuantity ?? (activeTable.sent ? i.quantity : 0)) === 0 && (
                    <button
                      type="button"
                      className="small-action danger remove-order-product"
                      title="Quitar producto del pedido"
                      onClick={() => removeOrderProduct(i.productId)}
                    >
                      <Trash2 size={16}/>
                      Quitar
                    </button>
                  )}
                </div>;
              })}</div>}
            <div className="order-footer"><div className="total-line"><span>Total</span><strong>{formatCurrency(total(activeTable.items))}</strong></div>
              {(!activeTable.sent ||
                activeTable.items.some(
                  i => i.quantity > (i.sentQuantity ?? (activeTable.sent ? i.quantity : 0))
                )) && (
                <button className="primary-button" onClick={sendOrder}>
                  <Send size={17} />
                  {activeTable.sent ? 'Enviar nueva ronda' : 'Enviar comanda'}
                </button>
              )}
              {role === 'Caja' && (
                <button
                  className="pay-button"
                  disabled={!activeTable.items.length || activeTable.paymentPending}
                  onClick={() => {
                    updateTable(activeTable.id, (t) => ({
                      ...t,
                      paymentPending: true,
                    }));
                    setSelected(null);
                    setPage('Mesas');
                    setNotice('Cuenta preparada. Genera el ticket y revisa el total antes de registrar el pago.');
                  }}
                >
                  <Receipt size={17} /> Continuar al cobro
                </button>
              )}
              <button className="back-button" onClick={() => setSelected(null)}>Volver a las mesas</button>
            </div>
          </section>
        </div>}

        {page === 'Comandas' && <section className="panel">
          <div className="section-heading"><div><h2>Comandas por preparar</h2><p>Las comandas servidas salen de esta lista; la mesa permanece ocupada hasta cobrar.</p></div></div>
          {tables.filter(t => pendingItems(t).length > 0).length === 0
            ? <div className="empty-state"><Utensils size={32}/><strong>No hay comandas pendientes</strong><p>Cuando envíes un pedido, aparecerá aquí.</p></div>
            : tables.filter(t => pendingItems(t).length > 0).map(t => {
              const items = pendingItems(t);
              return (
                <div className="command-card" key={t.id}>
                  <div><h3>Mesa {t.id}</h3><span>{items.map(i => `${i.pendingQuantity} × ${i.name}`).join(' · ')}</span></div>
                  <strong>{formatCurrency(total(items.map(item => ({ ...item, quantity: item.pendingQuantity }))))}</strong>
                  <button className="primary-button serve-button" onClick={() => {
                    updateTable(t.id, table => ({
                      ...table,
                      items: table.items.map(item => ({
                        ...item,
                        servedQuantity: item.sentQuantity ?? (table.sent ? item.quantity : 0),
                      })),
                    }));
                    setNotice(`Comanda de la mesa ${t.id} marcada como servida.`);
                  }}>Orden servida</button>
                </div>
              );
            })}
        </section>}

        {page === 'Inventario' && <section className="inventory-hub">
          <div className="inventory-hero">
            <div className="inventory-hero-copy">
              <span className="inventory-eyebrow">CENTRO DE CONTROL</span>
              <h2>Inventario inteligente</h2>
              <p>Administra tu menú, controla las compras y consulta cada movimiento de existencias desde un solo lugar.</p>
            </div>
            <div className="inventory-hero-icon">
              <Package size={38} />
            </div>
          </div>

          <div className="inventory-overview">
            <button
              type="button"
              className={`inventory-tab ${inventoryTab === 'menu' ? 'selected' : ''}`}
              aria-pressed={inventoryTab === 'menu'}
              onClick={() => setInventoryTab('menu')}
            >
              <span className="inventory-tab-icon menu-icon"><Utensils size={22}/></span>
              <span className="inventory-tab-copy">
                <strong>Menú e inventario</strong>
                <small>Productos, precios y existencias</small>
                <b>{products.length} productos registrados</b>
              </span>
              <span className="inventory-tab-arrow" aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              className={`inventory-tab ${inventoryTab === 'compras' ? 'selected' : ''}`}
              aria-pressed={inventoryTab === 'compras'}
              onClick={() => setInventoryTab('compras')}
            >
              <span className="inventory-tab-icon purchase-icon"><ShoppingCart size={22}/></span>
              <span className="inventory-tab-copy">
                <strong>Registrar compras</strong>
                <small>Entradas y costos de adquisición</small>
                <b>Reponer existencias</b>
              </span>
              <span className="inventory-tab-arrow" aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              className={`inventory-tab ${inventoryTab === 'kardex' ? 'selected' : ''}`}
              aria-pressed={inventoryTab === 'kardex'}
              onClick={() => setInventoryTab('kardex')}
            >
              <span className="inventory-tab-icon kardex-icon"><BookOpenText size={22}/></span>
              <span className="inventory-tab-copy">
                <strong>Kardex</strong>
                <small>Historial y trazabilidad</small>
                <b>{movements.length} movimientos registrados</b>
              </span>
              <span className="inventory-tab-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>}

        {page === 'Inventario' && inventoryTab === 'menu' && <>
          <div className="section-heading"><div><h2>Menú e inventario</h2><p>Agrega productos al menú y controla las existencias.</p></div></div>
          <section className="panel">
            {editingProductId !== null && (
              <div className="product-editing-banner">
                <strong>Editando: {newName}</strong>
                <button type="button" className="back-button" onClick={cancelEditProduct}>
                  Cancelar edición
                </button>
              </div>
            )}
            <div className="inventory-form">
              <input aria-label="Nombre del producto" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del artículo"/>
              <input aria-label="Precio de venta" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder={`Precio ${restaurant.currency === 'USD' ? 'US$' : 'C$'}`}/>
              <select
                aria-label="Control de inventario"
                value={newStockControl}
                onChange={e => setNewStockControl(e.target.value as 'controlable' | 'no-controlable')}
              >
                <option value="controlable">Stock controlable</option>
                <option value="no-controlable">Stock no controlable</option>
              </select>
              {newStockControl === 'controlable' && (
                <input aria-label="Stock inicial" type="number" min="0" step="1" value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="Stock inicial"/>
              )}
              <select
                aria-label="Categoría del producto"
                value={newCategory}
                onChange={e => {
                  const selectedCategory = e.target.value;
                  setNewCategory(selectedCategory);
                  setNewStockControl(
                    selectedCategory === 'Cocina' ? 'no-controlable' : 'controlable'
                  );
                }}
              >
                <option>Bebidas</option><option>Snacks</option><option>Otros</option><option>Cocina</option>
              </select>
              <button className="primary-button" onClick={addProduct} disabled={isAddingProduct}>
                {editingProductId !== null
                  ? <><CheckCircle2 size={17}/> Guardar cambios</>
                  : <><Plus size={17}/> {isAddingProduct ? 'Buscando imagen…' : 'Agregar'}</>}
              </button>
            </div>
            <div className="table-scroll"><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr></thead>
              <tbody>{products.map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.category}</td><td>{formatCurrency(p.price)}</td><td>{p.stock === null ? 'No controlable' : `${p.stock} unidades`}</td>
                <td>
                  <button className="small-action" disabled={isAddingProduct} onClick={() => startEditProduct(p)} aria-label={`Editar ${p.name}`} title={`Editar ${p.name}`}>
                    <Pencil size={15}/>
                  </button>
                  <button className="small-action" disabled={p.stock === null} onClick={() => adjustStock(p.id, 1, 'Ajuste manual +1')} aria-label={`Aumentar stock de ${p.name}`}><Plus size={15}/> 1</button>
                  <button className="small-action" disabled={p.stock === null || p.stock <= 0} onClick={() => adjustStock(p.id, -1, 'Ajuste manual -1')} aria-label={`Reducir stock de ${p.name}`}><Minus size={15}/> 1</button>
                  <button className="small-action danger" onClick={() => {
                    const enCuentaAbierta = tables.some(table =>
                      table.items.some(item => item.productId === p.id)
                    );

                    if (enCuentaAbierta) {
                      setNotice('No se puede eliminar este producto porque aparece en una cuenta abierta.');
                      return;
                    }

                    if (window.confirm(`¿Eliminar definitivamente ${p.name}?`)) {
                      setProducts(old => old.filter(product => product.id !== p.id));
                      if (editingProductId === p.id) {
                        setEditingProductId(null);
                        setNewName('');
                        setNewPrice('0');
                        setNewStock('0');
                        setNewStockControl('controlable');
                        setNewCategory('Bebidas');
                      }
                      setNotice(`Producto "${p.name}" eliminado.`);
                    }
                  }} aria-label={`Eliminar ${p.name}`} title={`Eliminar ${p.name}`}>
                    <Trash2 size={15}/> Eliminar
                  </button>
                </td></tr>)}</tbody>
            </table></div>
          </section>
        </>}

        {page === 'Inventario' && inventoryTab === 'compras' && <section className="panel inventory-content">
          <h2>Registrar compra de inventario</h2>
          <p>Las compras aumentan existencias y generan una entrada en el Kardex.</p>
          <div className="purchase-form">
            <label>Producto
              <select value={purchaseProductId} onChange={event => setPurchaseProductId(event.target.value)}>
                <option value="">Selecciona un producto</option>
                {products.filter(product => product.stock !== null).map(product =>
                  <option key={product.id} value={product.id}>{product.name} · stock {product.stock}</option>
                )}
              </select>
            </label>
            <label>Cantidad
              <input type="number" min="1" step="1" value={purchaseQuantity} onChange={event => setPurchaseQuantity(event.target.value)} placeholder="Unidades"/>
            </label>
            <label>Costo unitario ({restaurant.currency === 'USD' ? 'US$' : 'C$'})
              <input type="number" min="0" step="0.01" value={purchaseUnitCost} onChange={event => setPurchaseUnitCost(event.target.value)} placeholder="0.00"/>
            </label>
            <label>Referencia o motivo
              <input value={purchaseReason} onChange={event => setPurchaseReason(event.target.value)} placeholder="Proveedor, factura..."/>
            </label>
            <button className="primary-button" onClick={registerPurchase}><ShoppingCart size={17}/> Registrar compra</button>
          </div>
        </section>}

        {page === 'Inventario' && inventoryTab === 'kardex' && <section className="panel inventory-content">
          <div className="section-heading"><div><h2>Kardex de inventario</h2><p>Entradas por compras, salidas por ventas cobradas y ajustes de existencias.</p></div></div>
          {movements.length === 0
            ? <div className="empty-state"><BookOpenText size={32}/><strong>Aún no hay movimientos</strong><p>Las compras, ventas cobradas y ajustes aparecerán aquí.</p></div>
            : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock anterior</th><th>Stock nuevo</th><th>Costo unitario</th><th>Motivo</th></tr></thead>
              <tbody>{movements.map(movement => <tr key={movement.id}>
                <td>{new Date(movement.createdAt).toLocaleString('es-NI')}</td>
                <td><strong>{movement.productName}</strong></td>
                <td>{movement.type}</td>
                <td className={movement.quantity < 0 ? 'movement-out' : 'movement-in'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td>
                <td>{movement.stockBefore}</td>
                <td>{movement.stockAfter}</td>
                <td>{movement.unitCost === null ? '—' : formatCurrency(movement.unitCost)}</td>
                <td>{movement.reason}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>}

        {page === 'Arqueo' && <section className="panel">
          <h2>Arqueo de inventario</h2>
          <p>Cuenta físicamente tus artículos y compara el resultado con el stock registrado.</p>
          <div className="table-scroll"><table><thead><tr><th>Artículo</th><th>Stock registrado</th><th>Conteo físico</th><th>Motivo</th><th>Estado</th></tr></thead>
            <tbody>{products.filter(p => p.stock !== null).map(p => <tr key={p.id}><td>{p.name}</td><td>{p.stock}</td><td><input key={`count-${p.id}-${p.stock}`} aria-label={`Conteo de ${p.name}`} type="number" min="0" defaultValue={p.stock ?? 0} id={`count-${p.id}`}/></td><td><input key={`reason-${p.id}-${p.stock}`} aria-label={`Motivo de diferencia ${p.name}`} id={`reason-${p.id}`} placeholder="Ej. merma"/></td><td>Conteo editable</td></tr>)}</tbody>
          </table></div>
          <button className="primary-button" onClick={() => {
            const counts = products.filter(p => p.stock !== null).map(p => ({
              id: p.id,
              count: Number((document.getElementById(`count-${p.id}`) as HTMLInputElement)?.value),
              reason: (document.getElementById(`reason-${p.id}`) as HTMLInputElement)?.value || '',
            }));
            if (counts.some(c => !Number.isInteger(c.count) || c.count < 0)) {
              setNotice('Todos los conteos deben ser números enteros no negativos.');
              return;
            }
            const differences = counts.filter(c => products.find(p => p.id === c.id)?.stock !== c.count);
            if (differences.some(c => !c.reason.trim())) {
              setNotice('Justifica cada diferencia antes de aplicar el ajuste.');
              return;
            }
            if (!window.confirm(`¿Aplicar ${differences.length} ajuste(s) de inventario? Esta acción cambiará las existencias.`)) return;
            const now = timestampNow();
            const adjustmentMovements = differences.flatMap(difference => {
              const product = products.find(item => item.id === difference.id);
              if (!product || product.stock === null) return [];
              return [{
                id: `${Date.now()}-${product.id}`,
                productId: product.id,
                productName: product.name,
                type: 'Ajuste' as const,
                quantity: difference.count - product.stock,
                stockBefore: product.stock,
                stockAfter: difference.count,
                unitCost: null,
                reason: difference.reason.trim(),
                createdAt: now,
              }];
            });
            setProducts(old => old.map(p => {
              const c = counts.find(x => x.id === p.id);
              return c && p.stock !== null ? {...p, stock: c.count} : p;
            }));
            setMovements(old => [...adjustmentMovements, ...old]);
            setNotice(`Arqueo aplicado. ${differences.length} diferencia(s) ajustada(s).`);
          }}><ClipboardCheck size={17}/> Aplicar arqueo y ajustes</button>
        </section>}

        {page === 'Edición' && activeFloor && (
          <section className="panel floor-editor">
            <div className="floor-editor-heading">
              <div>
                <h2>Editor visual del restaurante</h2>
                <p>Arrastra los elementos para organizar tu salón. Los cambios se guardan automáticamente.</p>
              </div>
            </div>

            <div className="floor-editor-toolbar">
              <label>
                Piso
                <select
                  value={activeFloorId}
                  onChange={event => {
                    setActiveFloorId(event.target.value);
                    setActiveSectionId('main');
                    setSelectedElementId(null);
                  }}
                >
                  {floorPlans.map(floor => (
                    <option key={floor.id} value={floor.id}>{floor.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Zona
                <select
                  value={activeSectionId}
                  onChange={event => {
                    setActiveSectionId(event.target.value);
                    setSelectedElementId(null);
                  }}
                >
                  {activeFloor.sections.map(section => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </label>

              <button type="button" className="back-button" onClick={addFloorTable}>
                <Plus size={16} /> Agregar mesa
              </button>
              <button type="button" className="back-button" onClick={addBar}>
                <Plus size={16} /> Agregar barra
              </button>
              <button type="button" className="back-button" onClick={addSection}>
                <Plus size={16} /> Nueva zona
              </button>
              <button type="button" className="back-button" onClick={addFloor}>
                <Plus size={16} /> Nuevo piso
              </button>
            </div>

            <p className="floor-plan-help">
              Selecciona un elemento para cambiar su apariencia. Arrástralo para moverlo.
            </p>

            <div
              className="floor-plan-canvas floor-plan-editor-canvas"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                const bounds = event.currentTarget.getBoundingClientRect();
                if (!id || !bounds.width || !bounds.height) return;

                const x = ((event.clientX - bounds.left) / bounds.width) * 100;
                const y = ((event.clientY - bounds.top) / bounds.height) * 100;
                moveFloorElement(id, x, y);
              }}
            >
              {activeFloor.elements
                .filter(element => element.section === activeSectionId)
                .map(element => {
                  const table = element.tableId === undefined
                    ? undefined
                    : tables.find(item => item.id === element.tableId);

                  return (
                    <button
                      key={element.id}
                      type="button"
                      draggable
                      className={[
                        'floor-element',
                        element.kind === 'bar' ? 'floor-bar' : 'floor-table',
                        `shape-${element.shape}`,
                        `material-${element.material}`,
                        selectedElementId === element.id ? 'selected-element' : '',
                        table?.items.length ? 'occupied' : '',
                      ].join(' ')}
                      style={{ left: `${element.x}%`, top: `${element.y}%` }}
                      onClick={() => setSelectedElementId(element.id)}
                      onDragStart={event => {
                        event.dataTransfer.setData('text/plain', element.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setSelectedElementId(element.id);
                      }}
                    >
                      {element.kind === 'bar' ? (
                        <span>{element.label}</span>
                      ) : (
                        <>
                          <strong>{element.tableId}</strong>
                          <small>{element.label}</small>
                        </>
                      )}
                    </button>
                  );
                })}
            </div>

            {activeElement && (
              <div className="floor-element-settings">
                <h3>Personalizar: {activeElement.label}</h3>
                <label>
                  Nombre
                  <input
                    value={activeElement.label}
                    onChange={event => updateSelectedElement({ label: event.target.value })}
                  />
                </label>

                {activeElement.kind === 'table' && (
                  <>
                    <label>
                      Forma
                      <select
                        value={activeElement.shape}
                        onChange={event => updateSelectedElement({
                          shape: event.target.value as FloorElement['shape'],
                        })}
                      >
                        <option value="round">Redonda</option>
                        <option value="square">Cuadrada</option>
                        <option value="rectangle">Rectangular</option>
                      </select>
                    </label>
                    <label>
                      Material
                      <select
                        value={activeElement.material}
                        onChange={event => updateSelectedElement({
                          material: event.target.value as FloorElement['material'],
                        })}
                      >
                        <option value="wood">Madera</option>
                        <option value="metal">Metal</option>
                      </select>
                    </label>
                  </>
                )}

                <label>
                  Zona
                  <select
                    value={activeElement.section}
                    onChange={event => updateSelectedElement({ section: event.target.value })}
                  >
                    {activeFloor.sections.map(section => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                </label>

                <button type="button" className="back-button" onClick={removeSelectedElement}>
                  <Trash2 size={16} /> Eliminar elemento
                </button>
              </div>
            )}

            <div className="floor-plan-legend">
              <span><i className="legend-wood" /> Madera</span>
              <span><i className="legend-metal" /> Metal</span>
              <span>Las mesas ocupadas se identifican por su estado real.</span>
            </div>
          </section>
        )}

        {page === 'Configuración' && <section className="panel settings-panel">
          <h2>Configuración del restaurante</h2>
          <p>Los datos del negocio, productos, compras y movimientos de inventario se guardan en este navegador.</p>
          <section className="panel restaurant-info-panel">
            <h3>Datos de la empresa o restaurante</h3>
            <p>Completa la información que quieres mostrar en los tickets de venta. Cambiar la moneda no convierte los precios ya registrados.</p>
            <form
              className="restaurant-form"
              onSubmit={event => {
                event.preventDefault();
                try {
                  localStorage.setItem('mf-restaurant-info', JSON.stringify(restaurant));
                  setRestaurantSaved(true);
                  setRestaurantSaveError('');
                  setNotice('Datos del restaurante guardados correctamente.');
                } catch {
                  setRestaurantSaved(false);
                  setRestaurantSaveError('No se pudieron guardar los datos en este navegador.');
                }
              }}
            >
              <label>
                Nombre comercial
                <input
                  value={restaurant.name}
                  onChange={event => updateRestaurant('name', event.target.value)}
                  placeholder="Nombre comercial del restaurante"
                />
              </label>
              <label>
                Razón social
                <input
                  value={restaurant.legalName}
                  onChange={event => updateRestaurant('legalName', event.target.value)}
                  placeholder="Razón social (opcional)"
                />
              </label>
              <label>
                RUC
                <input
                  value={restaurant.ruc}
                  onChange={event => updateRestaurant('ruc', event.target.value)}
                  placeholder="RUC (opcional)"
                />
              </label>
              <label>
                Dirección
                <input
                  value={restaurant.address}
                  onChange={event => updateRestaurant('address', event.target.value)}
                  placeholder="Dirección del restaurante"
                />
              </label>
              <label>
                Teléfono
                <input
                  type="tel"
                  value={restaurant.phone}
                  onChange={event => updateRestaurant('phone', event.target.value)}
                  placeholder="Teléfono"
                />
              </label>
              <label>
                Correo electrónico
                <input
                  type="email"
                  value={restaurant.email}
                  onChange={event => updateRestaurant('email', event.target.value)}
                  placeholder="Correo electrónico"
                />
              </label>
              <label>
                Encabezado del ticket
                <input
                  value={restaurant.receiptTitle}
                  onChange={event => updateRestaurant('receiptTitle', event.target.value)}
                  placeholder="TICKET DE VENTA"
                />
              </label>
              <label>
                Moneda
                <select
                  value={restaurant.currency}
                  onChange={event => updateRestaurant('currency', event.target.value as RestaurantInfo['currency'])}
                >
                  <option value="NIO">Córdobas (C$)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </label>
              <label className="restaurant-form-wide">
                Datos o instrucciones de pago (opcional)
                <textarea
                  value={restaurant.paymentInfo}
                  onChange={event => updateRestaurant('paymentInfo', event.target.value)}
                  placeholder="Banco, titular, últimos dígitos de cuenta u otra indicación para el cliente"
                  rows={3}
                />
              </label>
              <label className="restaurant-form-wide">
                Mensaje al pie del ticket
                <textarea
                  value={restaurant.thankYou}
                  onChange={event => updateRestaurant('thankYou', event.target.value)}
                  placeholder="¡Gracias por su compra!"
                  rows={2}
                />
              </label>
              <div className="restaurant-form-wide">
                <button type="submit" className="primary-button">
                  Guardar datos del restaurante
                </button>
                {restaurantSaved && <p className="restaurant-save-status" role="status">Datos guardados correctamente.</p>}
                {restaurantSaveError && <p className="restaurant-save-error" role="alert">{restaurantSaveError}</p>}
              </div>
            </form>
          </section>
          <div className="setting-row"><div><strong>Menú y precios</strong><p>Agrega productos desde el módulo Inventario.</p></div><button className="back-button" onClick={() => { setInventoryTab('menu'); setPage('Inventario'); }}>Abrir inventario</button></div>
          <div className="setting-row"><div><strong>Distribución de mesas</strong><p>Diseña y guarda la distribución visual de tus mesas, zonas, barras y pisos.</p></div><button type="button" className="back-button" onClick={() => setPage('Edición')}>Abrir editor</button></div>
          <div className="setting-row"><div><strong>Roles</strong><p>Selector de rol de demostración; aún no constituye seguridad real.</p></div><span className="status">Prototipo</span></div>
          <button className="back-button" onClick={() => { if (window.confirm('¿Restablecer menú, mesas, plano y movimientos de demostración?')) { setProducts(initialProducts); setTables(initialTables); setMovements([]); setFloorPlans(createInitialFloorPlan()); setActiveFloorId('floor-1'); setActiveSectionId('main'); setSelectedElementId(null); setSelected(null); setNotice('Datos de demostración restablecidos.'); }}}>Restablecer datos de demostración</button>
        </section>}
        <footer>MesaFácil POS · Prototipo local · Los precios son configurables</footer>
      </main>
    </div>
  );
}