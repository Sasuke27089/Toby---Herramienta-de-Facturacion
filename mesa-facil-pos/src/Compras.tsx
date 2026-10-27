import { useMemo, useState } from 'react';
import {
  CheckCircle2, ClipboardList, CreditCard, Plus, Search, Trash2,
  Truck, X,
} from 'lucide-react';
import './compras.css';

export type PurchaseProduct = {
  id: number;
  name: string;
  stock: number | null;
};

export type PurchaseLine = {
  productId: number;
  productName: string;
  quantity: number;
  unitCost: number;
  discount: number;
};

type PurchaseStatus = 'Borrador' | 'Pendiente' | 'Recibida';
type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Cheque' | 'Otro';
type PurchasePayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
};
type PurchaseRecord = {
  id: string;
  supplier: string;
  invoice: string;
  purchaseDate: string;
  notes: string;
  lines: PurchaseLine[];
  generalDiscount: number;
  taxRate: number;
  extraCharges: number;
  status: PurchaseStatus;
  createdAt: string;
  receivedAt?: string;
  payments: PurchasePayment[];
};
type ProductDraft = {
  productId: string;
  quantity: string;
  unitCost: string;
  discount: string;
};
type Props = {
  products: PurchaseProduct[];
  currency: 'NIO' | 'USD';
  onReceivePurchase: (
    purchaseId: string,
    lines: PurchaseLine[],
    reference: string
  ) => string | null;
};

const STORAGE_KEY = 'mf-purchases';
const emptyProductDraft: ProductDraft = {
  productId: '',
  quantity: '1',
  unitCost: '',
  discount: '0',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isPurchaseLine(value: unknown): value is PurchaseLine {
  if (!isObject(value)) return false;
  return Number.isInteger(value.productId) &&
    typeof value.productName === 'string' &&
    Number.isInteger(value.quantity) &&
    typeof value.unitCost === 'number' &&
    Number.isFinite(value.unitCost) &&
    typeof value.discount === 'number' &&
    Number.isFinite(value.discount);
}

function isPurchaseRecord(value: unknown): value is PurchaseRecord {
  if (!isObject(value)) return false;
  const statuses: PurchaseStatus[] = ['Borrador', 'Pendiente', 'Recibida'];
  return typeof value.id === 'string' &&
    typeof value.supplier === 'string' &&
    typeof value.invoice === 'string' &&
    typeof value.purchaseDate === 'string' &&
    typeof value.notes === 'string' &&
    Array.isArray(value.lines) &&
    value.lines.every(isPurchaseLine) &&
    typeof value.generalDiscount === 'number' &&
    Number.isFinite(value.generalDiscount) &&
    typeof value.taxRate === 'number' &&
    Number.isFinite(value.taxRate) &&
    typeof value.extraCharges === 'number' &&
    Number.isFinite(value.extraCharges) &&
    statuses.includes(value.status as PurchaseStatus) &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.payments) &&
    value.payments.every(payment =>
      isObject(payment) &&
      typeof payment.id === 'string' &&
      typeof payment.amount === 'number' &&
      Number.isFinite(payment.amount) &&
      ['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque', 'Otro'].includes(
        payment.method as PaymentMethod
      ) &&
      typeof payment.createdAt === 'string'
    );
}

function readPurchases(): { purchases: PurchaseRecord[]; error: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { purchases: [], error: '' };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isPurchaseRecord)) {
      throw new Error('El historial guardado tiene un formato inesperado.');
    }
    return { purchases: parsed, error: '' };
  } catch (error) {
    console.error('No se pudieron leer las compras guardadas.', error);
    return {
      purchases: [],
      error: 'No se pudo leer el historial local; no se sobrescribió para proteger los datos existentes.',
    };
  }
}

const dateToday = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export default function Compras({ products, currency, onReceivePurchase }: Props) {
  const [initialLoad] = useState(readPurchases);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(initialLoad.purchases);
  const [storageError, setStorageError] = useState(initialLoad.error);
  const [storageReady, setStorageReady] = useState(!initialLoad.error);
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(dateToday);
  const [notes, setNotes] = useState('');
  const [draftLine, setDraftLine] = useState<ProductDraft>(emptyProductDraft);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [generalDiscount, setGeneralDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [extraCharges, setExtraCharges] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [receiptFilter, setReceiptFilter] = useState('Todos');
  const [paymentFilter, setPaymentFilter] = useState('Todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, {
    amount: string;
    method: PaymentMethod;
  }>>({});

  const updatePurchases = (
    updater: (old: PurchaseRecord[]) => PurchaseRecord[]
  ): boolean => {
    if (!storageReady) {
      setStorageError('Restablece el historial dañado antes de guardar cambios.');
      return false;
    }
    const updatedPurchases = updater(purchases);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPurchases));
      setPurchases(updatedPurchases);
      setStorageError('');
      return true;
    } catch (error) {
      console.error('No se pudo guardar el historial de compras.', error);
      setStorageError('No se pudo guardar el historial. Revisa el espacio disponible del navegador.');
      return false;
    }
  };

  const resetUnreadableHistory = () => {
    if (!window.confirm(
      'No se pudo leer el historial de compras. ¿Eliminar el registro local dañado e iniciar uno nuevo?'
    )) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      setPurchases([]);
      setStorageReady(true);
      setStorageError('');
      setNotice('Historial local reiniciado.');
    } catch (error) {
      console.error('No se pudo restablecer el historial de compras.', error);
      setStorageError('No se pudo restablecer el historial local.');
    }
  };

  const formatCurrency = (amount: number) =>
    `${currency === 'USD' ? 'US$' : 'C$'} ${amount.toFixed(2)}`;

  const getTotals = (purchase: Pick<
    PurchaseRecord,
    'lines' | 'generalDiscount' | 'taxRate' | 'extraCharges'
  >) => {
    const gross = purchase.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitCost,
      0
    );
    const lineDiscounts = purchase.lines.reduce(
      (sum, line) => sum + line.discount,
      0
    );
    const discountedSubtotal = Math.max(
      0,
      gross - lineDiscounts - purchase.generalDiscount
    );
    const tax = discountedSubtotal * purchase.taxRate / 100;
    return {
      subtotal: gross,
      discount: lineDiscounts + purchase.generalDiscount,
      tax,
      total: discountedSubtotal + tax + purchase.extraCharges,
    };
  };

  const getPaidAmount = (purchase: PurchaseRecord) =>
    purchase.payments.reduce((sum, payment) => sum + payment.amount, 0);

  const getPaymentStatus = (purchase: PurchaseRecord) => {
    const due = Math.max(0, getTotals(purchase).total - getPaidAmount(purchase));
    if (due <= 0.005) return 'Pagada';
    return getPaidAmount(purchase) > 0 ? 'Abonada' : 'Pendiente';
  };

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return purchases
      .filter(purchase => {
        const matchesSearch = !query ||
          purchase.supplier.toLocaleLowerCase().includes(query) ||
          purchase.invoice.toLocaleLowerCase().includes(query) ||
          purchase.lines.some(line => line.productName.toLocaleLowerCase().includes(query));
        const matchesReceipt = receiptFilter === 'Todos' ||
          purchase.status === receiptFilter;
        const matchesPayment = paymentFilter === 'Todos' ||
          getPaymentStatus(purchase) === paymentFilter;
        return matchesSearch && matchesReceipt && matchesPayment &&
          (!dateFrom || purchase.purchaseDate >= dateFrom) &&
          (!dateTo || purchase.purchaseDate <= dateTo);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [purchases, search, receiptFilter, paymentFilter, dateFrom, dateTo]);

  const resetForm = () => {
    setSupplier('');
    setInvoice('');
    setPurchaseDate(dateToday());
    setNotes('');
    setDraftLine(emptyProductDraft);
    setLines([]);
    setGeneralDiscount('0');
    setTaxRate('0');
    setExtraCharges('0');
    setEditingId(null);
  };

  const addLine = () => {
    const productId = Number(draftLine.productId);
    const product = products.find(item => item.id === productId);
    const quantity = Number(draftLine.quantity);
    const unitCost = Number(draftLine.unitCost);
    const discount = Number(draftLine.discount);
    if (!product || product.stock === null) {
      setNotice('Selecciona un producto que controle existencias.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 ||
      !Number.isFinite(unitCost) || unitCost < 0 ||
      !Number.isFinite(discount) || discount < 0 ||
      discount > quantity * unitCost) {
      setNotice('Revisa la cantidad, el costo unitario y el descuento del producto.');
      return;
    }
    setLines(old => [...old, {
      productId,
      productName: product.name,
      quantity,
      unitCost,
      discount,
    }]);
    setDraftLine(emptyProductDraft);
    setNotice('');
  };

  const savePurchase = (status: 'Borrador' | 'Pendiente') => {
    if (lines.length === 0) {
      setNotice('Agrega al menos un producto a la compra.');
      return;
    }
    const numericDiscount = Number(generalDiscount);
    const numericTax = Number(taxRate);
    const numericCharges = Number(extraCharges);
    const subtotalAfterLineDiscounts = lines.reduce(
      (sum, line) => sum + line.quantity * line.unitCost - line.discount,
      0
    );
    if (!purchaseDate || !Number.isFinite(numericDiscount) || numericDiscount < 0 ||
      numericDiscount > subtotalAfterLineDiscounts ||
      !Number.isFinite(numericTax) || numericTax < 0 || numericTax > 100 ||
      !Number.isFinite(numericCharges) || numericCharges < 0) {
      setNotice('Revisa la fecha, los descuentos, los impuestos y los cargos adicionales.');
      return;
    }

    const current = editingId
      ? purchases.find(purchase => purchase.id === editingId)
      : undefined;
    const nextPurchase: PurchaseRecord = {
      id: current?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      supplier: supplier.trim(),
      invoice: invoice.trim(),
      purchaseDate,
      notes: notes.trim(),
      lines,
      generalDiscount: numericDiscount,
      taxRate: numericTax,
      extraCharges: numericCharges,
      status,
      createdAt: current?.createdAt ?? new Date().toISOString(),
      payments: current?.payments ?? [],
    };
    const paidAmount = current ? getPaidAmount(current) : 0;
    if (paidAmount > getTotals(nextPurchase).total) {
      setNotice('El total no puede quedar por debajo de los abonos ya registrados.');
      return;
    }

    const saved = updatePurchases(old => current
      ? old.map(purchase => purchase.id === current.id ? nextPurchase : purchase)
      : [nextPurchase, ...old]);
    if (!saved) return;
    resetForm();
    setNotice(status === 'Borrador'
      ? 'Borrador guardado; no se modificó el inventario.'
      : 'Compra pendiente guardada; recibe la mercancía para actualizar el inventario.');
  };

  const editPurchase = (purchase: PurchaseRecord) => {
    if (getPaidAmount(purchase) > 0) {
      setNotice('No se puede editar una compra que ya tiene abonos registrados.');
      return;
    }
    setEditingId(purchase.id);
    setSupplier(purchase.supplier);
    setInvoice(purchase.invoice);
    setPurchaseDate(purchase.purchaseDate);
    setNotes(purchase.notes);
    setLines(purchase.lines);
    setGeneralDiscount(String(purchase.generalDiscount));
    setTaxRate(String(purchase.taxRate));
    setExtraCharges(String(purchase.extraCharges));
    setNotice('Editando compra. Guardar no modificará las existencias.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const receivePurchase = (purchase: PurchaseRecord) => {
    if (purchase.status !== 'Pendiente') {
      setNotice('Guarda el borrador como compra pendiente antes de confirmar la recepción.');
      return;
    }
    if (!window.confirm(
      `¿Confirmas la recepción de ${purchase.lines.length} producto(s) de ${purchase.supplier || 'este proveedor'}? Esta acción actualizará inventario y Kardex.`
    )) return;

    const error = onReceivePurchase(
      purchase.id,
      purchase.lines,
      [purchase.supplier, purchase.invoice && `Factura ${purchase.invoice}`]
        .filter(Boolean)
        .join(' · ') || 'Recepción de compra'
    );
    if (error) {
      setNotice(error);
      return;
    }
    const saved = updatePurchases(old => old.map(item =>
      item.id === purchase.id
        ? { ...item, status: 'Recibida', receivedAt: new Date().toISOString() }
        : item
    ));
    if (!saved) {
      setNotice('El inventario se actualizó, pero no se pudo guardar el estado de recepción. Reintenta o revisa el almacenamiento local.');
      return;
    }
    setNotice('Compra recibida. Inventario y Kardex fueron actualizados.');
  };

  const markPurchasePending = (purchase: PurchaseRecord) => {
    const saved = updatePurchases(old => old.map(item =>
      item.id === purchase.id ? { ...item, status: 'Pendiente' } : item
    ));
    if (!saved) return;
    setNotice('Borrador confirmado como compra pendiente; las existencias no cambiaron.');
  };

  const addPayment = (purchase: PurchaseRecord) => {
    const draft = paymentDrafts[purchase.id] ?? {
      amount: '',
      method: 'Efectivo' as PaymentMethod,
    };
    const amount = Number(draft.amount);
    const due = getTotals(purchase).total - getPaidAmount(purchase);
    if (purchase.status !== 'Recibida') {
      setNotice('Confirma la recepción antes de registrar abonos.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > due + 0.005) {
      setNotice('El abono debe ser positivo y no puede superar el saldo pendiente.');
      return;
    }
    const payment: PurchasePayment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      amount,
      method: draft.method,
      createdAt: new Date().toISOString(),
    };
    const saved = updatePurchases(old => old.map(item =>
      item.id === purchase.id
        ? { ...item, payments: [...item.payments, payment] }
        : item
    ));
    if (!saved) return;
    setPaymentDrafts(old => ({
      ...old,
      [purchase.id]: { ...draft, amount: '' },
    }));
    setNotice('Abono registrado. Las existencias no fueron modificadas.');
  };

  const removeLine = (index: number) =>
    setLines(old => old.filter((_, lineIndex) => lineIndex !== index));

  const totals = getTotals({
    lines,
    generalDiscount: Number(generalDiscount) || 0,
    taxRate: Number(taxRate) || 0,
    extraCharges: Number(extraCharges) || 0,
  });

  return (
    <section className="purchases-page">
      <header className="purchases-heading">
        <div>
          <span className="purchases-eyebrow">ABASTECIMIENTO</span>
          <h2>Compras</h2>
          <p>Registra facturas y controla la recepción y los pagos a proveedores.</p>
        </div>
        <div className="purchases-heading-icon"><Truck size={28}/></div>
      </header>

      {notice && (
        <div className="purchases-notice" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>
            <X size={16}/>
          </button>
        </div>
      )}
      {storageError && (
        <div className="purchases-error" role="alert">
          <span>{storageError}</span>
          {!storageReady && (
            <button type="button" className="back-button" onClick={resetUnreadableHistory}>
              Restablecer historial
            </button>
          )}
        </div>
      )}

      <section className="panel purchases-form-panel">
        <div className="purchases-section-title">
          <div>
            <h3>{editingId ? 'Editar compra' : 'Registrar factura'}</h3>
            <p>Las compras guardadas no afectan existencias hasta confirmar la recepción.</p>
          </div>
          {editingId && (
            <button type="button" className="back-button" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
        </div>

        <div className="purchases-fields">
          <label>Proveedor
            <input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder="Nombre del proveedor"/>
          </label>
          <label>Número de factura
            <input value={invoice} onChange={event => setInvoice(event.target.value)} placeholder="Ej. F-000123"/>
          </label>
          <label>Fecha de compra
            <input type="date" value={purchaseDate} onChange={event => setPurchaseDate(event.target.value)}/>
          </label>
          <label className="purchases-field-wide">Notas
            <input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Referencia, vencimiento u observaciones"/>
          </label>
        </div>

        <div className="purchase-line-entry">
          <label>Producto
            <select
              value={draftLine.productId}
              onChange={event => setDraftLine(old => ({ ...old, productId: event.target.value }))}
            >
              <option value="">Selecciona un producto</option>
              {products.filter(product => product.stock !== null).map(product => (
                <option key={product.id} value={product.id}>
                  {product.name} · stock actual {product.stock}
                </option>
              ))}
            </select>
          </label>
          <label>Cantidad
            <input type="number" min="1" step="1" value={draftLine.quantity} onChange={event => setDraftLine(old => ({ ...old, quantity: event.target.value }))}/>
          </label>
          <label>Costo unitario ({currency === 'USD' ? 'US$' : 'C$'})
            <input type="number" min="0" step="0.01" value={draftLine.unitCost} onChange={event => setDraftLine(old => ({ ...old, unitCost: event.target.value }))}/>
          </label>
          <label>Descuento del producto
            <input type="number" min="0" step="0.01" value={draftLine.discount} onChange={event => setDraftLine(old => ({ ...old, discount: event.target.value }))}/>
          </label>
          <button type="button" className="primary-button purchase-add-line" onClick={addLine}>
            <Plus size={16}/> Agregar producto
          </button>
        </div>

        {lines.length > 0 && (
          <div className="table-scroll purchases-lines">
            <table>
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Descuento</th><th>Total línea</th><th></th></tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.productId}-${index}`}>
                    <td>{line.productName}</td>
                    <td>{line.quantity}</td>
                    <td>{formatCurrency(line.unitCost)}</td>
                    <td>{formatCurrency(line.discount)}</td>
                    <td>{formatCurrency(line.quantity * line.unitCost - line.discount)}</td>
                    <td>
                      <button type="button" className="small-action danger" aria-label={`Quitar ${line.productName}`} onClick={() => removeLine(index)}>
                        <Trash2 size={15}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="purchases-totals-fields">
          <label>Descuento general
            <input type="number" min="0" step="0.01" value={generalDiscount} onChange={event => setGeneralDiscount(event.target.value)}/>
          </label>
          <label>Impuesto (%)
            <input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={event => setTaxRate(event.target.value)}/>
          </label>
          <label>Cargos adicionales
            <input type="number" min="0" step="0.01" value={extraCharges} onChange={event => setExtraCharges(event.target.value)}/>
          </label>
          <div className="purchase-total-summary">
            <span>Subtotal {formatCurrency(totals.subtotal)}</span>
            <span>Descuentos −{formatCurrency(totals.discount)}</span>
            <span>Impuesto {formatCurrency(totals.tax)}</span>
            <strong>Total {formatCurrency(totals.total)}</strong>
          </div>
        </div>

        <div className="purchases-form-actions">
          <button type="button" className="back-button" onClick={() => savePurchase('Borrador')}>
            <ClipboardList size={16}/> Guardar borrador
          </button>
          <button type="button" className="primary-button" onClick={() => savePurchase('Pendiente')}>
            <CheckCircle2 size={16}/> Guardar compra pendiente
          </button>
        </div>
      </section>

      <section className="panel purchases-history">
        <div className="purchases-section-title">
          <div>
            <h3>Historial de compras</h3>
            <p>{filteredPurchases.length} compra(s) encontradas</p>
          </div>
        </div>
        <div className="purchases-filters">
          <label className="purchases-search">
            <Search size={16}/>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar proveedor, factura o producto"/>
          </label>
          <label>Recepción
            <select value={receiptFilter} onChange={event => setReceiptFilter(event.target.value)}>
              <option>Todos</option><option>Borrador</option><option>Pendiente</option><option>Recibida</option>
            </select>
          </label>
          <label>Pago
            <select value={paymentFilter} onChange={event => setPaymentFilter(event.target.value)}>
              <option>Todos</option><option>Pendiente</option><option>Abonada</option><option>Pagada</option>
            </select>
          </label>
          <label>Desde
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)}/>
          </label>
          <label>Hasta
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)}/>
          </label>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={30}/>
            <strong>No hay compras para mostrar</strong>
            <p>Registra una factura o cambia los filtros del historial.</p>
          </div>
        ) : (
          <div className="purchases-record-list">
            {filteredPurchases.map(purchase => {
              const purchaseTotals = getTotals(purchase);
              const paid = getPaidAmount(purchase);
              const due = Math.max(0, purchaseTotals.total - paid);
              const paymentStatus = getPaymentStatus(purchase);
              const paymentDraft = paymentDrafts[purchase.id] ?? {
                amount: '',
                method: 'Efectivo' as PaymentMethod,
              };
              return (
                <article className="purchase-record" key={purchase.id}>
                  <header className="purchase-record-heading">
                    <div>
                      <strong>{purchase.supplier || 'Proveedor sin especificar'}</strong>
                      <span>
                        {purchase.invoice ? `Factura ${purchase.invoice} · ` : ''}
                        {purchase.purchaseDate}
                      </span>
                    </div>
                    <div className="purchase-badges">
                      <span className={`purchase-badge ${purchase.status.toLowerCase()}`}>{purchase.status}</span>
                      <span className={`purchase-badge payment-${paymentStatus.toLowerCase()}`}>{paymentStatus}</span>
                    </div>
                  </header>
                  <div className="purchase-record-content">
                    <div>
                      <ul className="purchase-record-lines">
                        {purchase.lines.map((line, index) => (
                          <li key={`${line.productId}-${index}`}>
                            {line.quantity} × {line.productName} · {formatCurrency(line.quantity * line.unitCost - line.discount)}
                          </li>
                        ))}
                      </ul>
                      {purchase.notes && <p className="purchase-record-note">{purchase.notes}</p>}
                    </div>
                    <div className="purchase-record-balance">
                      <span>Total <strong>{formatCurrency(purchaseTotals.total)}</strong></span>
                      <span>Pagado <strong>{formatCurrency(paid)}</strong></span>
                      <span>Saldo <strong>{formatCurrency(due)}</strong></span>
                    </div>
                  </div>

                  {purchase.payments.length > 0 && (
                    <details className="purchase-payment-history">
                      <summary>Abonos ({purchase.payments.length})</summary>
                      {purchase.payments.map(payment => (
                        <p key={payment.id}>
                          {new Date(payment.createdAt).toLocaleString('es-NI')} · {payment.method} · {formatCurrency(payment.amount)}
                        </p>
                      ))}
                    </details>
                  )}

                  <footer className="purchase-record-actions">
                    {purchase.status !== 'Recibida' && (
                      <>
                        <button type="button" className="back-button" onClick={() => editPurchase(purchase)}>
                          Editar
                        </button>
                        {purchase.status === 'Borrador' ? (
                          <button type="button" className="back-button" onClick={() => markPurchasePending(purchase)}>
                            Confirmar compra
                          </button>
                        ) : (
                          <button type="button" className="primary-button" onClick={() => receivePurchase(purchase)}>
                            <Truck size={15}/> Confirmar recepción
                          </button>
                        )}
                      </>
                    )}
                    {purchase.status === 'Recibida' && due > 0.005 && (
                      <div className="purchase-payment-entry">
                        <input
                          type="number"
                          min="0.01"
                          max={due}
                          step="0.01"
                          aria-label={`Monto del abono a ${purchase.supplier || 'proveedor'}`}
                          placeholder={`Saldo ${formatCurrency(due)}`}
                          value={paymentDraft.amount}
                          onChange={event => setPaymentDrafts(old => ({
                            ...old,
                            [purchase.id]: { ...paymentDraft, amount: event.target.value },
                          }))}
                        />
                        <select
                          aria-label="Método de pago"
                          value={paymentDraft.method}
                          onChange={event => setPaymentDrafts(old => ({
                            ...old,
                            [purchase.id]: {
                              ...paymentDraft,
                              method: event.target.value as PaymentMethod,
                            },
                          }))}
                        >
                          <option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Cheque</option><option>Otro</option>
                        </select>
                        <button type="button" className="back-button" onClick={() => addPayment(purchase)}>
                          <CreditCard size={15}/> Registrar abono
                        </button>
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
