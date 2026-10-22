import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import {
  LayoutDashboard, Utensils, Package, ClipboardCheck,
  Settings, Plus, Minus, Trash2, Send, Receipt, Wifi,
  Search, X, CheckCircle2, Banknote, CreditCard, Clock3, ArrowLeft
} from 'lucide-react';
import './index.css';

const RECEIPT_WIDTH_MM: 80 | 100 = 80;
const API_URL = "http://localhost:3001";

async function comprobarServidor() {
  try {
    const response = await fetch(`${API_URL}/api/orders`);

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log("Pedidos recibidos del servidor:", data.orders);
    return data.orders;
  } catch (error) {
    console.error("No se pudo conectar con el servidor:", error);
    return null;
  }
}

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number | null;
};

type Item = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  sentQuantity?: number;
};

type TableData = {
  id: number;
  items: Item[];
  sent: boolean;
  paymentPending?: boolean;
};

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

export default function App() {
  const [role, setRole] = useState<'Caja' | 'Mesero'>('Caja');
  const [page, setPage] = useState('Mesas');
  const [products, setProducts] = useState<Product[]>(
    () => readStorage('mf-products', initialProducts)
  );
  const [tables, setTables] = useState<TableData[]>(
    () => readStorage('mf-tables', initialTables)
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('0');
  const [newStock, setNewStock] = useState('0');
  const [newCategory, setNewCategory] = useState('Bebidas');
  const [notice, setNotice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Tarjeta'>('Efectivo');
  const [cashReceived, setCashReceived] = useState('');

  useEffect(() => {
    localStorage.setItem('mf-products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('mf-tables', JSON.stringify(tables));
  }, [tables]);

  const activeTable = tables.find(t => t.id === selected);
  const total = (items: Item[]) =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const generateReceiptPDF = (tableId: number, items: Item[]) => {
    const width = RECEIPT_WIDTH_MM;
    const margin = 6;
    const contentWidth = width - margin * 2;
    const columns = {
      item: contentWidth * 0.39,
      quantity: contentWidth * 0.13,
      price: contentWidth * 0.21,
      amount: contentWidth * 0.27,
    };
    const itemX = margin;
    const quantityX = itemX + columns.item;
    const priceX = quantityX + columns.quantity;
    const rightEdge = width - margin;
    const measureDoc = new jsPDF({ unit: 'mm', format: [width, 120] });
    measureDoc.setFontSize(7.5);

    const rows = items.map(item => ({
      item,
      descriptionLines: measureDoc.splitTextToSize(item.name, columns.item - 1),
    }));
    const rowHeights = rows.map(row => Math.max(4.5, row.descriptionLines.length * 3.5) + 2.5);
    const firstRowY = 56;
    const rowsEndY = firstRowY + rowHeights.reduce((sum, height) => sum + height, 0);
    const pageHeight = Math.max(94, rowsEndY + 36);
    const doc = new jsPDF({ unit: 'mm', format: [width, pageHeight] });

    doc.setDrawColor(30);
    doc.setLineWidth(0.25);
    doc.rect(2.2, 2.2, width - 4.4, pageHeight - 4.4);
    doc.setLineWidth(0.15);
    doc.rect(3.8, 3.8, width - 7.6, pageHeight - 7.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TICKET DE VENTA', width / 2, 15, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Mesa: ${tableId}`, margin, 24);
    doc.text(
      `Fecha: ${new Date().toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'short' })}`,
      margin,
      29,
    );

    doc.setLineWidth(0.45);
    doc.line(margin, 34, rightEdge, 34);
    doc.setLineWidth(0.2);
    doc.line(margin, 35.5, rightEdge, 35.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DETALLE DE ARTÍCULOS', margin, 43);

    doc.setFontSize(6.8);
    doc.text('ARTÍCULO', itemX, 50);
    doc.text('CANT.', quantityX + columns.quantity / 2, 50, { align: 'center' });
    doc.text('PRECIO', priceX + columns.price - 1, 50, { align: 'right' });
    doc.text('IMPORTE', rightEdge, 50, { align: 'right' });

    doc.setLineWidth(0.25);
    doc.line(margin, 52.5, rightEdge, 52.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    let y = firstRowY;

    rows.forEach(({ item, descriptionLines }, index) => {
      doc.text(descriptionLines, itemX, y);
      doc.text(String(item.quantity), quantityX + columns.quantity / 2, y, { align: 'center' });
      doc.text(item.price.toFixed(2), priceX + columns.price - 1, y, { align: 'right' });
      doc.text((item.price * item.quantity).toFixed(2), rightEdge, y, { align: 'right' });

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

    const amount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TOTAL', margin, y);
    doc.setFontSize(13);
    doc.text(`C$ ${amount.toFixed(2)}`, rightEdge, y, { align: 'right' });

    y += 8;
    doc.setLineWidth(0.25);
    doc.line(margin, y, rightEdge, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Gracias por su compra', width / 2, y + 7, { align: 'center' });

    doc.save(`ticket-mesa-${tableId}.pdf`);
  };

  const updateTable = (id: number, fn: (t: TableData) => TableData) => {
    setTables(old => old.map(t => t.id === id ? fn(t) : t));
  };

  const addToOrder = (product: Product) => {
    if (selected === null || !activeTable) return;

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

  const sendOrder = () => {
    if (!activeTable || selected === null || activeTable.items.length === 0) {
      setNotice('Agrega al menos un producto antes de enviar.');
      return;
    }

    const hasNewItems = activeTable.items.some(
      i => i.quantity > (i.sentQuantity ?? (activeTable.sent ? i.quantity : 0)),
    );

    if (activeTable.sent && !hasNewItems) {
      setNotice('Agrega productos nuevos antes de enviar otra ronda.');
      return;
    }

    updateTable(selected, t => ({
      ...t,
      sent: true,
      items: t.items.map(i => ({
        ...i,
        sentQuantity: i.quantity,
      })),
    }));

    setNotice(
      activeTable.sent
        ? `Nueva ronda de la mesa ${selected} enviada.`
        : `Comanda de mesa ${selected} enviada.`,
    );

      setSelected(null);
      setPage('Mesas');
  };

  const closeAccount = () => {
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

    if (!window.confirm(`¿Confirmas cerrar la cuenta de C$ ${amount.toFixed(2)}?`)) {
      return;
    }

    setProducts(old => old.map(p => {
      if (p.stock === null) return p;

      const sold = activeTable.items
        .filter(i => i.productId === p.id)
        .reduce((sum, i) => sum + i.quantity, 0);

      return { ...p, stock: Math.max(0, p.stock - sold) };
    }));

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

  const addProduct = () => {
    const name = newName.trim();
    const price = Number(newPrice);
    const stock = Number(newStock);
    if (!name || !Number.isFinite(price) || price < 0 ||
        !Number.isInteger(stock) || stock < 0) {
      setNotice('Revisa el nombre, el precio y el stock.');
      return;
    }
    setProducts(old => [...old, {
      id: Date.now(), name, price, category: newCategory,
      stock: newCategory === 'Cocina' ? null : stock,
    }]);
    setNewName('');
    setNewPrice('0');
    setNewStock('0');
    setNotice('Producto agregado al menú.');
  };

  const visibleProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (category === 'Todos' || p.category === category)
  );

  const nav = [
    { name: 'Mesas', icon: LayoutDashboard },
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
            onClick={() => { setPage(n.name); setSelected(null); }}>
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

        {page === 'Mesas' && selected === null && <>
          <div className="stats">
            <div className="stat-card"><span>Mesas totales</span><strong>{tables.length}</strong><small>Distribución actual</small></div>
            <div className="stat-card"><span>Mesas ocupadas</span><strong>{tables.filter(t => t.items.length > 0).length}</strong><small>Con consumo abierto</small></div>
            <div className="stat-card"><span>Mesas disponibles</span><strong>{tables.filter(t => t.items.length === 0).length}</strong><small>Listas para recibir clientes</small></div>
            <div className="stat-card"><span>Ventas abiertas</span><strong>C$ {tables.reduce((s, t) => s + total(t.items), 0).toFixed(2)}</strong><small>Consumo sin cerrar</small></div>
          </div>
          <div className="section-heading">
            <div><h2>Mapa de mesas</h2><p>Selecciona una mesa para tomar un pedido o cobrar.</p></div>
            <div className="legend"><span className="dot free" /> Libre <span className="dot busy" /> Ocupada</div>
          </div>
          <div className="table-grid">
            {tables.map(t => <button key={t.id}
              className={`table-card ${t.items.length ? 'occupied' : ''}`}
              onClick={() => setSelected(t.id)}>
              <div className="table-top"><span className="table-number">{String(t.id).padStart(2, '0')}</span>
                <span className={`status ${t.items.length ? 'busy-text' : ''}`}>{t.items.length ? 'Ocupada' : 'Libre'}</span></div>
              <div className="table-symbol"><Utensils size={24} /></div>
              <strong>Mesa {t.id}</strong>
              <span className="table-detail">{t.items.reduce((s, i) => s + i.quantity, 0)} productos</span>
              <b className="table-total">C$ {total(t.items).toFixed(2)}</b>
            </button>)}
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
                        <span>{item.quantity} × C$ {item.price.toFixed(2)}</span>
                      </div>
                      <b>C$ {(item.quantity * item.price).toFixed(2)}</b>
                    </div>
                  ))}
                </div>

                <div className="payment-total">
                  <span>Total a cobrar</span>
                  <strong>C$ {total(activeTable.items).toFixed(2)}</strong>
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
                      <span>C$</span>
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
                          <strong>C$ {(Number(cashReceived) - total(activeTable.items)).toFixed(2)}</strong>
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
              {visibleProducts.map(p => <button key={p.id} className="product-card"
                onClick={() => addToOrder(p)}>
                <span className="product-emoji">{p.category === 'Cocina' ? '🍔' : p.category === 'Bebidas' ? '🥤' : p.category === 'Snacks' ? '🍟' : '🛍️'}</span>
                <strong>{p.name}</strong><small>{p.category}</small>
                <b>C$ {p.price.toFixed(2)}</b><span className="add-icon"><Plus size={16}/></span>
              </button>)}
            </div>
          </section>
          <section className="panel order-panel">
            <div className="order-title"><div><h2>Pedido · Mesa {selected}</h2><p>{activeTable.sent
              ? 'Pedido enviado · Puedes agregar una nueva ronda'
              : 'Pedido en preparación'}</p></div>
              <Receipt size={24}/></div>
            {activeTable.items.length === 0
              ? <div className="empty-state"><Utensils size={34}/><strong>Tu pedido está vacío</strong><p>Agrega productos del menú.</p></div>
              : <div className="order-items">{activeTable.items.map(i => <div className="order-line" key={i.productId}>
                <div className="order-product"><strong>{i.name}</strong><small>C$ {i.price.toFixed(2)} c/u</small></div>
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
                <b>C$ {(i.price * i.quantity).toFixed(2)}</b>
              </div>)}</div>}
            <div className="order-footer"><div className="total-line"><span>Total</span><strong>C$ {total(activeTable.items).toFixed(2)}</strong></div>
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
                    generateReceiptPDF(activeTable.id, activeTable.items);
                    updateTable(activeTable.id, (t) => ({
                      ...t,
                      paymentPending: true,
                    }));
                    setSelected(null);
                    setPage('Mesas');
                    setNotice('Ticket generado. La cuenta sigue pendiente de pago.');
                  }}
                >
                  <Receipt size={17} /> Generar ticket PDF
                </button>
              )}
              <button className="back-button" onClick={() => setSelected(null)}>Volver a las mesas</button>
            </div>
          </section>
        </div>}

        {page === 'Comandas' && <section className="panel">
          <div className="section-heading"><div><h2>Comandas por preparar</h2><p>Pedidos que se han marcado como enviados en este dispositivo.</p></div></div>
          {tables.filter(t => t.sent && t.items.length).length === 0
            ? <div className="empty-state"><Utensils size={32}/><strong>No hay comandas pendientes</strong><p>Cuando envíes un pedido, aparecerá aquí.</p></div>
            : tables.filter(t => t.sent && t.items.length).map(t => <div className="command-card" key={t.id}>
              <div><h3>Mesa {t.id}</h3><span>{t.items.map(i => `${i.quantity} × ${i.name}`).join(' · ')}</span></div>
              <strong>C$ {total(t.items).toFixed(2)}</strong>
            </div>)}
        </section>}

        {page === 'Inventario' && <>
          <div className="section-heading"><div><h2>Productos con stock</h2><p>Control local de bebidas, snacks y otros artículos.</p></div></div>
          <section className="panel">
            <div className="inventory-form">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del artículo"/>
              <input type="number" min="0" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Precio C$"/>
              <input type="number" min="0" value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="Stock inicial"/>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option>Bebidas</option><option>Snacks</option><option>Otros</option><option>Cocina</option>
              </select>
              <button className="primary-button" onClick={addProduct}><Plus size={17}/> Agregar</button>
            </div>
            <div className="table-scroll"><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr></thead>
              <tbody>{products.map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.category}</td><td>C$ {p.price.toFixed(2)}</td><td>{p.stock === null ? 'No controlado' : p.stock}</td>
                <td><button className="small-action" disabled={p.stock === null} onClick={() => setProducts(old => old.map(x => x.id === p.id && x.stock !== null ? {...x, stock: x.stock + 1} : x))}><Plus size={15}/> 1</button>
                <button className="small-action" disabled={p.stock === null || p.stock <= 0} onClick={() => setProducts(old => old.map(x => x.id === p.id && x.stock !== null ? {...x, stock: Math.max(0, x.stock - 1)} : x))}><Minus size={15}/> 1</button>
                {role === 'Caja' && <button className="small-action danger" onClick={() => { if (window.confirm(`¿Eliminar ${p.name} del menú?`)) setProducts(old => old.filter(x => x.id !== p.id)); }}><Trash2 size={15}/></button>}</td></tr>)}</tbody>
            </table></div>
          </section>
        </>}

        {page === 'Arqueo' && <section className="panel">
          <h2>Arqueo de inventario</h2>
          <p>Cuenta físicamente tus artículos y compara el resultado con el stock registrado.</p>
          <div className="table-scroll"><table><thead><tr><th>Artículo</th><th>Stock registrado</th><th>Conteo físico</th><th>Motivo</th><th>Estado</th></tr></thead>
            <tbody>{products.filter(p => p.stock !== null).map(p => <tr key={p.id}><td>{p.name}</td><td>{p.stock}</td><td><input aria-label={`Conteo de ${p.name}`} type="number" min="0" defaultValue={p.stock ?? 0} id={`count-${p.id}`}/></td><td><input aria-label={`Motivo de diferencia ${p.name}`} id={`reason-${p.id}`} placeholder="Ej. merma"/></td><td>Conteo editable</td></tr>)}</tbody>
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
            setProducts(old => old.map(p => {
              const c = counts.find(x => x.id === p.id);
              return c && p.stock !== null ? {...p, stock: c.count} : p;
            }));
            setNotice(`Arqueo aplicado. ${differences.length} diferencia(s) ajustada(s).`);
          }}><ClipboardCheck size={17}/> Aplicar arqueo y ajustes</button>
        </section>}

        {page === 'Configuración' && <section className="panel settings-panel">
          <h2>Configuración del restaurante</h2>
          <p>En esta primera versión, los productos se agregan manualmente desde Inventario.</p>
          <div className="setting-row"><div><strong>Menú y precios</strong><p>Agrega productos desde el módulo Inventario.</p></div><button className="back-button" onClick={() => setPage('Inventario')}>Abrir inventario</button></div>
          <div className="setting-row"><div><strong>Distribución de mesas</strong><p>Versión inicial: 12 mesas. El editor visual se añadirá en una siguiente etapa.</p></div><span className="status">Próximamente</span></div>
          <div className="setting-row"><div><strong>Fotografías de productos</strong><p>La búsqueda automática de imágenes requiere conexión a un servicio de imágenes.</p></div><span className="status">Próximamente</span></div>
          <div className="setting-row"><div><strong>Roles</strong><p>Selector de rol de demostración; aún no constituye seguridad real.</p></div><span className="status">Prototipo</span></div>
          <button className="back-button" onClick={() => { if (window.confirm('¿Restablecer menú y mesas de demostración?')) { setProducts(initialProducts); setTables(initialTables); setSelected(null); setNotice('Datos de demostración restablecidos.'); }}}>Restablecer datos de demostración</button>
        </section>}
        <footer>MesaFácil POS · Prototipo local · Los precios son configurables</footer>
      </main>
    </div>
  );
}