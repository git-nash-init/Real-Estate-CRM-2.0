// Real-estate payment collection is staged, not a lump sum -- the
// Agreement Value (consideration_amount) is only ever partly "due" at any
// point, based on the cumulative percentage a super admin has released for
// that project (project_payment_milestones). GST/Stamp Duty/Registration/
// Other Charges become due in full the moment the booking receives its
// first payment; Maintenance/Parking/Development Charges become due in
// full only once possession has been marked given.
export interface DueCalcBooking {
  consideration_amount?: number | null;
  booking_amount?: number | null;
  gst_amount?: number | null;
  stamp_duty?: number | null;
  registration_charges?: number | null;
  other_charges?: number | null;
  development_charges?: number | null;
  maintenance_charges?: number | null;
  parking_charges?: number | null;
  possession_date?: string | null;
}

/** Sum of a project's payment milestone percentages, capped at 100. */
export function totalMilestonePercentage(percentages: number[]): number {
  return Math.min(100, percentages.reduce((sum, p) => sum + (p || 0), 0));
}

/**
 * Total amount currently due on a booking (before subtracting what's
 * already been paid) -- NOT the same as the booking's full total_payable_amount,
 * which is the eventual grand total across every stage.
 */
export function computeCurrentlyDueTotal(b: DueCalcBooking, milestonePercentage: number, hasAnyPayment: boolean): number {
  const considerationAmount = b.consideration_amount ?? b.booking_amount ?? 0;
  const considerationDue = Math.min(considerationAmount, considerationAmount * (milestonePercentage / 100));
  const firstPaymentCharges = hasAnyPayment
    ? (b.gst_amount || 0) + (b.stamp_duty || 0) + (b.registration_charges || 0) + (b.other_charges || 0)
    : 0;
  const possessionCharges = b.possession_date
    ? (b.maintenance_charges || 0) + (b.parking_charges || 0) + (b.development_charges || 0)
    : 0;
  return considerationDue + firstPaymentCharges + possessionCharges;
}

/**
 * Per-category breakdown of what's currently due on a booking, keyed by
 * the same payment_type strings the Payments page's "New Payment" form
 * already uses (OCR / GST / Stamp Duty Registration / Development Charges
 * / Maintenance Charges / Other Charges) -- so the Payments page can show
 * every applicable charge as its own line, not just whatever's already
 * been manually recorded. Categories with nothing currently due are
 * omitted (e.g. GST before the first payment, or Development Charges
 * before possession).
 */
export function computeDueByCategory(b: DueCalcBooking, milestonePercentage: number, hasAnyPayment: boolean): { type: string; amount: number }[] {
  const considerationAmount = b.consideration_amount ?? b.booking_amount ?? 0;
  const considerationDue = Math.min(considerationAmount, considerationAmount * (milestonePercentage / 100));
  const categories: { type: string; amount: number }[] = [
    { type: 'OCR', amount: considerationDue },
    { type: 'GST', amount: hasAnyPayment ? (b.gst_amount || 0) : 0 },
    { type: 'Stamp Duty Registration', amount: hasAnyPayment ? (b.stamp_duty || 0) + (b.registration_charges || 0) : 0 },
    { type: 'Development Charges', amount: b.possession_date ? (b.development_charges || 0) : 0 },
    { type: 'Maintenance Charges', amount: b.possession_date ? (b.maintenance_charges || 0) : 0 },
    { type: 'Other Charges', amount: hasAnyPayment ? (b.other_charges || 0) : 0 },
  ];
  return categories.filter(c => c.amount > 0);
}
