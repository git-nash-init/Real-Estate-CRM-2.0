import { jsPDF } from 'jspdf';

// Indian numbering system (Lakh/Crore), matching how the invoice format
// spells amounts out -- e.g. 137932 -> "One Lakh Thirty Seven Thousand
// Nine Hundred Thirty Two Rupees Only."
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + twoDigits(n % 100) : ''}`;
}

export function numberToIndianWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - rupees) * 100);

  const crore = Math.floor(rupees / 1_00_00_000);
  const lakh = Math.floor((rupees % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((rupees % 1_00_000) / 1_000);
  const hundred = rupees % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  if (parts.length === 0) parts.push('Zero');

  let words = `${parts.join(' ').trim()} Rupees`;
  if (paisa > 0) {
    words += ` And ${twoDigits(paisa)} Paisa`;
  }
  return `${words} Only`;
}

export interface CpTaxInvoiceData {
  // Channel Partner's own letterhead -- this invoice is issued BY the CP
  // TO the developer, so the CP's own registered details go at the top.
  cpName: string;
  cpAddress: string;
  cpTel: string;
  cpEmail: string;

  invoiceNumber: string; // entered by the Channel Partner just before download
  invoiceDate: string;   // already formatted for display

  // Developer being billed
  developerName: string;
  developerAddress: string;
  developerGstin: string; // '' if unknown -- left blank
  projectRera: string;    // '' if unknown -- left blank

  cpPan: string;   // '' if unknown
  cpGstin: string; // '' if unknown -- also drives whether GST rows apply

  // Description of service (booking-specific)
  customerName: string;
  projectName: string;
  wing: string;    // building/tower
  flatNo: string;
  unitCost: number;

  // Brokerage -- brokerageAmount is the amount actually APPROVED for this
  // commission (super admin's approved payable_amount), not necessarily
  // the full theoretical commission on the deal.
  brokeragePercentage: number | null;
  brokerageAmount: number;

  // Only a GST-registered Channel Partner can legally charge GST -- when
  // false, the CGST/SGST rows are omitted entirely from the invoice (not
  // shown as zero), and total is brokerageAmount alone.
  gstApplicable: boolean;
  cgstAmount: number;
  sgstAmount: number;
  total: number;

  chequeFavouringName: string;

  // Bank details -- entered by the Channel Partner themselves (Settings ->
  // My Business Details). '' if not yet filled in -- left blank on the
  // invoice, never guessed at.
  accountName: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  ifscCode: string;

  bookingNumber: string; // for the downloaded filename only
}

// -- Palette, matched to the CRM's own indigo/slate theme --
const INDIGO: [number, number, number] = [79, 70, 229];
const INDIGO_DARK: [number, number, number] = [55, 48, 163];
const INDIGO_TINT: [number, number, number] = [238, 237, 253];
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_600: [number, number, number] = [71, 85, 105];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_200: [number, number, number] = [226, 232, 240];
const SLATE_50: [number, number, number] = [248, 250, 252];
const WHITE: [number, number, number] = [255, 255, 255];

function fmtRupees(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const BLANK = '_______________';

/**
 * Renders a GST-compliant Channel Partner commission tax invoice (CP ->
 * Developer) as a properly designed document -- branded header band,
 * bordered letterhead cards, a real ruled table, and a highlighted total --
 * rather than a plain text dump. Fields the CRM doesn't collect (SFDC UID,
 * CRN, REAP ID, Service Account Code, developer GSTIN/RERA if not entered
 * on the project) are left blank for the CP/admin to fill in by hand --
 * never guessed at.
 */
export function downloadCpTaxInvoicePdf(data: CpTaxInvoiceData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  // ---------- low-level helpers ----------
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  const label = (text: string, x: number, y: number, opts: { align?: 'left' | 'right' | 'center'; size?: number } = {}) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(opts.size ?? 6.8);
    setText(SLATE_400);
    doc.text(text.toUpperCase(), x, y, { align: opts.align ?? 'left' });
  };

  const value = (text: string, x: number, y: number, opts: { align?: 'left' | 'right' | 'center'; size?: number; bold?: boolean; maxWidth?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 9);
    setText(SLATE_900);
    if (opts.maxWidth) {
      const wrapped = doc.splitTextToSize(text, opts.maxWidth);
      wrapped.forEach((l: string, i: number) => doc.text(l, x, y + i * 11, { align: opts.align ?? 'left' }));
      return wrapped.length;
    }
    doc.text(text, x, y, { align: opts.align ?? 'left' });
    return 1;
  };

  let y = 0;

  // ---------- 1. Header band ----------
  const headerH = 100;
  setFill(INDIGO);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  setFill(INDIGO_DARK);
  doc.rect(0, headerH - 4, pageWidth, 4, 'F');

  setText(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((data.cpName || 'Channel Partner').toUpperCase(), marginX, 30, { maxWidth: contentWidth - 170 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(224, 231, 255);
  doc.text('Name as per RERA certificate', marginX, 43);

  const contactBits = [data.cpTel && `Tel: ${data.cpTel}`, data.cpEmail && `Email: ${data.cpEmail}`].filter(Boolean).join('   |   ');
  if (contactBits) doc.text(contactBits, marginX, 58, { maxWidth: contentWidth - 170 });
  if (data.cpAddress) {
    const addrLines: string[] = doc.splitTextToSize(data.cpAddress, contentWidth - 170).slice(0, 2);
    addrLines.forEach((l: string, i: number) => doc.text(l, marginX, 71 + i * 11));
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setText(WHITE);
  doc.text('TAX INVOICE', pageWidth - marginX, 32, { align: 'right' });

  y = headerH + 22;

  // ---------- 2. Meta strip: Invoice No / Date ----------
  const metaH = 34;
  setFill(SLATE_50);
  setDraw(SLATE_200);
  doc.setLineWidth(0.75);
  doc.roundedRect(marginX, y, contentWidth, metaH, 4, 4, 'FD');
  const metaColW = contentWidth / 2;
  const metaItems: [string, string][] = [
    ['Invoice No.', data.invoiceNumber || BLANK],
    ['Invoice Date', data.invoiceDate || BLANK],
  ];
  metaItems.forEach(([l, v], i) => {
    const cx = marginX + i * metaColW + 14;
    if (i > 0) { setDraw(SLATE_200); doc.line(marginX + i * metaColW, y + 6, marginX + i * metaColW, y + metaH - 6); }
    label(l, cx, y + 13);
    value(v, cx, y + 25, { bold: true, size: 9.5 });
  });
  y += metaH + 18;

  // ---------- 3. Letterhead cards: Issued By / Billed To ----------
  const cardGap = 16;
  const cardW = (contentWidth - cardGap) / 2;
  const cardPad = 12;
  const rowGap = 13;

  const cpRows: [string, string][] = [
    ['PAN Number', data.cpPan || BLANK],
    ['GSTIN', data.cpGstin || BLANK],
  ];
  const devRows: [string, string][] = [
    ['GSTIN', data.developerGstin || BLANK],
    ['Project RERA No.', data.projectRera || BLANK],
  ];

  const cardTitleH = 22;
  const addrWrapWidth = cardW - cardPad * 2;
  // The Channel Partner's own address is already on their letterhead in
  // the header band above -- omitted here to avoid repeating it.
  const cpAddrLines: string[] = [];
  const devAddrLines = data.developerAddress ? doc.splitTextToSize(data.developerAddress, addrWrapWidth) : [];

  const cpCardH = cardTitleH + 16 + cpAddrLines.length * 11 + 8 + cpRows.length * rowGap + cardPad;
  const devCardH = cardTitleH + 16 + devAddrLines.length * 11 + 8 + devRows.length * rowGap + cardPad;
  const cardH = Math.max(cpCardH, devCardH, 120);

  const drawCard = (x: number, title: string, name: string, addrLines: string[], rows: [string, string][]) => {
    setDraw(SLATE_200);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, cardW, cardH, 5, 5, 'S');
    setFill(INDIGO_TINT);
    doc.roundedRect(x, y, cardW, cardTitleH, 5, 5, 'F');
    doc.rect(x, y + cardTitleH - 5, cardW, 5, 'F'); // square off the bottom corners of the tab
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(INDIGO_DARK);
    doc.text(title.toUpperCase(), x + cardPad, y + 14.5);

    let cy = y + cardTitleH + 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(SLATE_900);
    doc.text(name || BLANK, x + cardPad, cy, { maxWidth: addrWrapWidth });
    cy += 12;

    if (addrLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      setText(SLATE_600);
      addrLines.forEach((l: string) => { doc.text(l, x + cardPad, cy); cy += 11; });
      cy += 4;
    } else {
      cy += 4;
    }

    rows.forEach(([l, v]) => {
      label(l, x + cardPad, cy, { size: 6.6 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      setText(SLATE_900);
      doc.text(v, x + cardPad + 78, cy);
      cy += rowGap;
    });
  };

  drawCard(marginX, 'Issued By  ·  Channel Partner', data.cpName, cpAddrLines, cpRows);
  drawCard(marginX + cardW + cardGap, 'Billed To  ·  Developer', data.developerName, devAddrLines, devRows);

  y += cardH + 20;

  // ---------- 4. Particulars table ----------
  const col1X = marginX + 10;      // Sr No
  const col2X = marginX + 40;      // Particulars
  const col3X = marginX + contentWidth - 130; // Tax rate
  const col4X = marginX + contentWidth - 14;  // Amount (right aligned)
  const tableTop = y;

  const rowH = 18;
  const headH = 22;

  const drawTableHeader = () => {
    setFill(INDIGO);
    doc.rect(marginX, y, contentWidth, headH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(WHITE);
    doc.text('#', col1X, y + 14, { align: 'center' });
    doc.text('PARTICULARS', col2X, y + 14);
    doc.text('TAX RATE', col3X, y + 14);
    doc.text('AMOUNT (RS.)', col4X, y + 14, { align: 'right' });
    y += headH;
  };
  drawTableHeader();

  type Row = { text: string; rate?: string; amount?: string; bold?: boolean; shaded?: boolean; muted?: boolean };
  const rows: Row[] = [
    { text: `Customer Name:  ${data.customerName}` },
    { text: `Project:  ${data.projectName}${data.wing ? `   ·   Wing: ${data.wing}` : ''}${data.flatNo ? `   ·   Unit: ${data.flatNo}` : ''}` },
    { text: `Agreement / Unit Cost:  Rs. ${fmtRupees(data.unitCost)}`, muted: true },
    {
      text: `Brokerage / Referral Fee${data.brokeragePercentage != null ? ` @ ${data.brokeragePercentage}%` : ''}`,
      amount: fmtRupees(data.brokerageAmount),
      bold: true,
    },
  ];
  // GST rows only appear at all for a GST-registered Channel Partner -- an
  // unregistered CP cannot legally charge GST, so nothing is shown (not
  // even a zeroed-out row) rather than implying a 9% rate was applied and
  // happened to come to nil.
  if (data.gstApplicable) {
    rows.push(
      { text: 'Central Goods & Service Tax (CGST)', rate: '9%', amount: fmtRupees(data.cgstAmount) },
      { text: 'State Goods & Service Tax (SGST)', rate: '9%', amount: fmtRupees(data.sgstAmount) },
    );
  } else {
    rows.push({ text: 'Not GST Registered -- no GST applicable on this invoice', muted: true });
  }

  doc.setFont('helvetica', 'normal');
  setDraw(SLATE_200);
  doc.setLineWidth(0.5);

  rows.forEach((r, idx) => {
    if (idx % 2 === 1) { setFill(SLATE_50); doc.rect(marginX, y, contentWidth, rowH, 'F'); }
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
    doc.setFontSize(8.6);
    setText(r.muted ? SLATE_600 : SLATE_900);
    const wrapped = doc.splitTextToSize(r.text, col3X - col2X - 10);
    doc.text(wrapped[0] || '', col2X, y + 12.5);
    if (r.rate) { doc.text(r.rate, col3X, y + 12.5); }
    if (r.amount) { doc.setFont('helvetica', r.bold ? 'bold' : 'normal'); doc.text(r.amount, col4X, y + 12.5, { align: 'right' }); }
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);
    y += rowH;
  });

  // GST subtotal row -- only when GST actually applies.
  if (data.gstApplicable) {
    const gstTotal = data.cgstAmount + data.sgstAmount;
    setFill(SLATE_50);
    doc.rect(marginX, y, contentWidth, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    setText(SLATE_600);
    doc.text('Total GST (CGST + SGST @ 18%)', col2X, y + 12.5);
    doc.text(fmtRupees(gstTotal), col4X, y + 12.5, { align: 'right' });
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);
    y += rowH;
  }

  const totalRowH = 26;
  setFill(INDIGO_DARK);
  doc.rect(marginX, y, contentWidth, totalRowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(WHITE);
  doc.text('GRAND TOTAL', col2X, y + 17);
  doc.text(`Rs. ${fmtRupees(data.total)}`, col4X, y + 17, { align: 'right' });
  y += totalRowH;

  setDraw(SLATE_200);
  doc.setLineWidth(0.75);
  doc.rect(marginX, tableTop, contentWidth, y - tableTop, 'S');

  y += 18;

  // ---------- 5. Amount in words ----------
  const wordsText = numberToIndianWords(data.total);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.6);
  const wordsLines = doc.splitTextToSize(`Amount in Words: ${wordsText}`, contentWidth - 24);
  const wordsBoxH = wordsLines.length * 12 + 14;
  setFill(INDIGO_TINT);
  doc.roundedRect(marginX, y, contentWidth, wordsBoxH, 4, 4, 'F');
  setFill(INDIGO);
  doc.rect(marginX, y, 3, wordsBoxH, 'F');
  setText(INDIGO_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  wordsLines.forEach((l: string, i: number) => doc.text(l, marginX + 14, y + 16 + i * 12));
  y += wordsBoxH + 22;

  // ---------- 6. Footer: payment note + bank details + signature ----------
  const footerColW = contentWidth / 2;
  const footerTop = y;

  label('Payable By Cheque / Transfer, Favouring', marginX, y, { size: 6.8 });
  value(data.chequeFavouringName || BLANK, marginX, y + 13, { bold: true, size: 10 });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  setText(SLATE_400);
  doc.text('(As per RERA certificate)', marginX, y + 25);

  const bankRows: [string, string][] = [
    ['Account Name', data.accountName || BLANK],
    ['Bank Name', data.bankName || BLANK],
    ['Branch', data.bankBranch || BLANK],
    ['Account No.', data.accountNumber || BLANK],
    ['IFSC Code', data.ifscCode || BLANK],
  ];
  let by = y + 40;
  label('Bank Details', marginX, by, { size: 6.8 });
  by += 12;
  bankRows.forEach(([l, v]) => {
    label(l, marginX, by, { size: 6.6 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    setText(SLATE_900);
    doc.text(v, marginX + 78, by);
    by += 13;
  });

  const sigX = marginX + footerColW;
  setDraw(SLATE_400);
  doc.setLineWidth(0.75);
  doc.line(sigX, footerTop + 34, sigX + footerColW - 4, footerTop + 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setText(SLATE_900);
  doc.text('Authorised Signatory', sigX, footerTop + 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(SLATE_400);
  doc.text('Stamp & Signature of Channel Partner', sigX, footerTop + 57);

  y = by + 8;

  // ---------- 7. Bottom disclaimer ----------
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  setText(SLATE_400);
  doc.text(
    'This is a system-generated tax invoice. Fields shown blank ( _____ ) are not held in the CRM and should be completed manually before use.',
    marginX,
    pageHeight - 28,
    { maxWidth: contentWidth },
  );
  setDraw(SLATE_200);
  doc.setLineWidth(0.5);
  doc.line(marginX, pageHeight - 36, marginX + contentWidth, pageHeight - 36);

  // Filename is the invoice number the Channel Partner entered -- falls
  // back to the booking number only if they somehow left it blank.
  const safeInvoiceNumber = (data.invoiceNumber || data.bookingNumber || 'invoice').replace(/[\\/:*?"<>|]/g, '-').trim();
  doc.save(`${safeInvoiceNumber}.pdf`);
}
